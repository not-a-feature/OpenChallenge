import Busboy from 'busboy';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { pipeline } from 'node:stream/promises';
import { error, isHttpError } from '@sveltejs/kit';

const archiveSuffixes = ['.tar.gz', '.tar.bz2', '.tar.xz', '.tgz', '.zip'];

function validMagic(bytes: Buffer, suffix: string) {
  if (suffix === '.zip') return bytes.subarray(0, 2).equals(Buffer.from('PK'));
  if (suffix === '.tar.gz' || suffix === '.tgz') return bytes.subarray(0, 2).equals(Buffer.from([0x1f, 0x8b]));
  if (suffix === '.tar.bz2') return bytes.subarray(0, 3).equals(Buffer.from('BZh'));
  return bytes.subarray(0, 6).equals(Buffer.from([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]));
}

export async function receiveArchive(request: Request, temporaryPath: string, maxBytes: number) {
  const headers = Object.fromEntries(request.headers);
  if (!headers['content-type']?.startsWith('multipart/form-data; boundary=')) error(400, 'Expected a multipart upload.');
  if (Number(headers['content-length'] ?? 0) > maxBytes + 65536) error(413, 'Compressed upload exceeds the size limit.');
  if (!request.body) error(400, 'Upload is empty.');
  let parser: ReturnType<typeof Busboy>;
  try { parser = Busboy({ headers, limits: { files: 1, fields: 1, parts: 3, fileSize: maxBytes + 1, fieldSize: 128, headerPairs: 32 } }); }
  catch (failure) {
    if (failure instanceof Error && ['Malformed content type', 'Multipart: Boundary not found'].includes(failure.message)) error(400, 'Malformed multipart content type.');
    throw failure;
  }
  let originalName = '', suffix = '', trackId = '', invalid = '', bytes = 0, fileCount = 0, oversized = false;
  let prefix = Buffer.alloc(0);
  const hash = createHash('sha256');
  const writers: Promise<unknown>[] = [];
  parser.on('field', (name, value, info) => {
    if (name !== 'trackId' || info.valueTruncated) invalid = 'Expected one trackId field.';
    trackId = value;
  });
  parser.on('file', (name, file, info) => {
    fileCount++;
    if (name !== 'file' || !info.filename || info.filename.length > 200) { invalid = 'Expected one archive in the file field.'; file.resume(); return; }
    originalName = info.filename;
    suffix = archiveSuffixes.find((ending) => originalName.toLowerCase().endsWith(ending)) ?? '';
    if (!suffix) { invalid = 'Upload a ZIP, TAR.GZ, TGZ, TAR.BZ2, or TAR.XZ archive.'; file.resume(); return; }
    file.on('limit', () => { oversized = true; });
    const measured = new Transform({ transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      hash.update(chunk);
      if (prefix.length < 6) prefix = Buffer.concat([prefix, chunk.subarray(0, 6 - prefix.length)]);
      callback(null, chunk);
    } });
    const writer = pipeline(file, measured, createWriteStream(temporaryPath, { flags: 'wx', mode: 0o600 }));
    // Attach a handler immediately; the result is checked below after the parser finishes.
    writers.push(writer.then(() => ({ ok: true }), (reason: unknown) => ({ ok: false, reason })));
  });
  for (const event of ['filesLimit', 'fieldsLimit', 'partsLimit']) parser.on(event, () => { invalid = 'Expected exactly one file and one trackId field.'; });
  let rawBytes = 0;
  const rawLimit = new Transform({ transform(chunk: Buffer, _encoding, callback) {
    rawBytes += chunk.length;
    if (rawBytes > maxBytes + 65536) { oversized = true; callback(new Error('Upload size limit exceeded.')); }
    else callback(null, chunk);
  } });
  let parseFailure = false;
  try { await pipeline(Readable.fromWeb(request.body as NodeReadableStream<Uint8Array>), rawLimit, parser); }
  catch (failure) { if (isHttpError(failure)) throw failure; parseFailure = true; }
  const outcomes = await Promise.all(writers) as { ok: boolean; reason?: unknown }[];
  if (oversized || bytes > maxBytes) error(413, 'Compressed upload exceeds the size limit.');
  if (parseFailure) error(400, 'Malformed or interrupted multipart upload.');
  const failedWrite = outcomes.find((outcome) => !outcome.ok);
  if (failedWrite) throw failedWrite.reason;
  if (invalid) error(400, invalid);
  if (fileCount !== 1 || !trackId || bytes === 0) error(400, 'Expected a nonempty archive and trackId.');
  if (!validMagic(prefix, suffix)) error(400, 'File content does not match the archive extension.');
  return { originalName, suffix, trackId, bytes, sha256: hash.digest('hex') };
}

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { isHttpError } from '@sveltejs/kit';
import { receiveArchive } from '../src/lib/server/uploads';

const boundary = 'portal-upload-test';
await mkdir(resolve('tmp'), { recursive: true });
const archive = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x01, 0x02]);
const multipart = Buffer.concat([
  Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="trackId"\r\n\r\ntrack-one\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="sample.zip"\r\nContent-Type: application/zip\r\n\r\n`),
  archive,
  Buffer.from(`\r\n--${boundary}--\r\n`)
]);

function request(body: Buffer, contentType = `multipart/form-data; boundary=${boundary}`) {
  return new Request('http://localhost/upload', { method: 'POST', headers: { 'content-type': contentType }, body: new Uint8Array(body) });
}

test('malformed multipart boundaries produce a client error before writing a file', async () => {
  for (const contentType of ['multipart/form-data; boundary="', 'multipart/form-data; boundary=', 'multipart/form-data; boundary=""']) {
    await assert.rejects(receiveArchive(request(multipart, contentType), resolve('tmp/not-created.part'), 1024),
      (failure) => isHttpError(failure, 400));
  }
});

test('streams the complete archive and computes its size and digest', async () => {
  const directory = await mkdtemp(resolve('tmp/upload-test-'));
  const path = resolve(directory, 'archive.part');
  try {
    const result = await receiveArchive(request(multipart), path, 1024);
    assert.deepEqual(await readFile(path), archive);
    assert.deepEqual(result, { originalName: 'sample.zip', suffix: '.zip', trackId: 'track-one', bytes: archive.length,
      sha256: createHash('sha256').update(archive).digest('hex') });
  } finally {
    await rm(directory, { recursive: true });
  }
});

test('rejects truncated file bodies after settling partial writes', async () => {
  const directory = await mkdtemp(resolve('tmp/upload-test-'));
  const path = resolve(directory, 'archive.part');
  try {
    const truncated = multipart.subarray(0, multipart.length - Buffer.byteLength(`\r\n--${boundary}--\r\n`));
    await assert.rejects(receiveArchive(request(truncated), path, 1024), (failure) => isHttpError(failure, 400));
    await rm(path);
  } finally {
    await rm(directory, { recursive: true });
  }
});

test('rejects oversized files after settling the write', async () => {
  const directory = await mkdtemp(resolve('tmp/upload-test-'));
  const path = resolve(directory, 'archive.part');
  try {
    await assert.rejects(receiveArchive(request(multipart), path, archive.length - 1), (failure) => isHttpError(failure, 413));
    await rm(path);
  } finally {
    await rm(directory, { recursive: true });
  }
});

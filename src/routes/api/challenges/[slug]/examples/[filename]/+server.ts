import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { error } from '@sveltejs/kit';
import { getChallenge } from '#lib/server/access.js';

export async function GET({ params }) {
  const { config } = await getChallenge(params.slug);
  if (!config.example || !['sample.csv', 'sample.zip', 'sample.tar.gz'].includes(params.filename)) error(404, 'Example file not found.');
  const content = await readFile(resolve('examples', params.slug, params.filename));
  return new Response(content, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${params.filename}"`, 'X-Content-Type-Options': 'nosniff' } });
}

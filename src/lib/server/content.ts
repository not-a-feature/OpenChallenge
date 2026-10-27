import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { challengeRoot } from './challenges';

export async function readMarkdown(slug: string, filename: string) {
  assert.match(slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.match(filename, /^(?:docs\/)?[a-z0-9]+(?:-[a-z0-9]+)*\.md$/);
  const source = await readFile(resolve(challengeRoot, slug, filename), 'utf8');
  return sanitizeHtml(await marked(source), {
    allowedTags: sanitizeHtml.defaults.allowedTags,
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedAttributes: { a: ['href', 'title'], code: ['class'] }
  });
}

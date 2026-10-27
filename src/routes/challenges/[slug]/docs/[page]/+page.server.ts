import { error } from '@sveltejs/kit';
import { getChallenge } from '#lib/server/access.js';
import { publicConfig } from '#lib/server/challenges.js';
import { readMarkdown } from '#lib/server/content.js';

export async function load({ params }) {
  const { config } = await getChallenge(params.slug);
  const page = config.docs.find((doc) => doc.slug === params.page);
  if (!page || !/^[a-z0-9-]+$/.test(page.slug)) error(404, 'Documentation page not found.');
  const html = await readMarkdown(params.slug, `docs/${page.slug}.md`);
  return { title: page.title, html, config: publicConfig(config) };
}

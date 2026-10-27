import 'dotenv/config';
import { configs } from '../src/lib/server/challenges';
import { readMarkdown } from '../src/lib/server/content';

for (const config of configs) {
  if (config.home) await readMarkdown(config.slug, config.home.body);
  for (const doc of config.docs) await readMarkdown(config.slug, `docs/${doc.slug}.md`);
  console.log(`${config.slug}: JSON valid; ${config.docs.length + (config.home ? 1 : 0)} Markdown files rendered.`);
}

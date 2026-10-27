import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { db, pool } from '../src/lib/server/db';
import { challenges, user } from '../src/lib/server/schema';
import { configs } from '../src/lib/server/challenges';
import { auth, demoMode, demoPassword } from '../src/lib/server/auth';

export async function seed() {
  for (const config of configs) await db.insert(challenges).values({ slug: config.slug, title: config.title, config }).onConflictDoUpdate({ target: challenges.slug, set: { title: config.title, config } });
  if (demoMode) {
    const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, 'demo@example.test'));
    if (!existing) await auth.api.signUpEmail({ body: { email: 'demo@example.test', password: demoPassword, name: 'Demo researcher' } });
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { await seed(); await pool.end(); }

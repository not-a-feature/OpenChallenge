import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { migrate as applyMigrations } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from '../src/lib/server/db';

export async function migrate() { await applyMigrations(db, { migrationsFolder: resolve('migrations') }); }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { await migrate(); await pool.end(); }

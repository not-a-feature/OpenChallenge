import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? 'postgresql://portal:local-development-only@127.0.0.1:5432/portal', max: 10 });
export const db = drizzle(pool, { schema });

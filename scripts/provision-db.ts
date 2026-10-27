import 'dotenv/config';
import assert from 'node:assert/strict';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  for (const [role, key] of [['portal_web', 'WEB_DATABASE_PASSWORD'], ['portal_worker', 'WORKER_DATABASE_PASSWORD']]) {
    const password = process.env[key];
    assert(password && password.length >= 24, `${key} requires at least 24 characters.`);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.ORIGIN ?? 'http://localhost:3000').hostname);
    assert(local || !password.startsWith('local-'), `Replace the example ${key} before deployment.`);
    assert(password !== decodeURIComponent(new URL(process.env.DATABASE_URL!).password), `${key} must differ from the database administrator password.`);
    assert(process.env.WEB_DATABASE_PASSWORD !== process.env.WORKER_DATABASE_PASSWORD, 'Web and worker database passwords must differ.');
    const existing = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);
    const command = existing.rowCount === 0 ? 'CREATE' : 'ALTER';
    await client.query(`${command} ROLE ${pg.escapeIdentifier(role)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT PASSWORD ${pg.escapeLiteral(password)}`);
  }
  const { rows } = await client.query('SELECT current_database() AS name');
  const database = pg.escapeIdentifier(rows[0].name);
  await client.query(`REVOKE ALL ON DATABASE ${database} FROM PUBLIC`);
  await client.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
  await client.query(`GRANT CONNECT ON DATABASE ${database} TO portal_web, portal_worker`);
  await client.query('GRANT USAGE ON SCHEMA public TO portal_web, portal_worker');
  await client.query('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM portal_web, portal_worker');
  await client.query('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO portal_web');
  await client.query('GRANT SELECT, UPDATE ON submissions TO portal_worker');
  await client.query('COMMIT');
  console.log('Provisioned separate web and worker database roles.');
} finally {
  client.release();
  await pool.end();
}

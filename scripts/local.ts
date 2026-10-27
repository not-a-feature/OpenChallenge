import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

const root = process.cwd();
assert(existsSync(resolve(root, 'build/index.js')), 'Run npm run build first.');
const directory = resolve(root, 'data/postgres');
await mkdir(resolve(root, 'data/uploads'), { recursive: true });
const database = new EmbeddedPostgres({ databaseDir: directory, user: 'portal', password: 'local-preview-only', port: 55432, persistent: true, postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: console.error });
const env = { ...process.env, VIRTUAL_ENV: undefined, DATABASE_URL: 'postgresql://portal:local-preview-only@127.0.0.1:55432/portal', ORIGIN: 'http://localhost:3000', BETTER_AUTH_URL: 'http://localhost:3000', HOST: '127.0.0.1', PORT: '3000', DEMO_MODE: 'true', ADMIN_EMAILS: process.env.ADMIN_EMAILS ?? 'demo@example.test', BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? 'local-preview-secret-at-least-thirty-two-characters', UPLOAD_DIR: resolve(root, 'data/uploads'), GROUND_TRUTH_DIR: resolve(root, 'examples/dna-inversion/private'), CHALLENGES_DIR: resolve(root, 'challenges'), BODY_SIZE_LIMIT: '12M' };
const children: ChildProcess[] = [];
let started = false;
let stopping: Promise<void> | undefined;

function stop() {
  return stopping ??= (async () => {
    await Promise.all(children.map(async (child) => {
      if (child.exitCode === null && child.signalCode === null) {
        const exit = once(child, 'exit');
        assert(child.pid, 'Child process has no PID.');
        if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
        else process.kill(-child.pid, 'SIGTERM');
        await exit;
      }
    }));
    if (started) await database.stop();
  })();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void stop().then(() => process.exit(0)); });
process.stdin.setEncoding('utf8');
process.stdin.on('data', (input: string) => { if (input.trim().toLowerCase() === 'q') void stop().then(() => process.exit(0)); });

try {
  if (!existsSync(resolve(directory, 'PG_VERSION'))) await database.initialise();
  await database.start();
  started = true;
  const connection = database.getPgClient('postgres', '127.0.0.1');
  await connection.connect();
  const existing = await connection.query("SELECT 1 FROM pg_database WHERE datname = 'portal'");
  if (existing.rowCount === 0) await connection.query('CREATE DATABASE portal');
  await connection.end();
  for (const script of ['scripts/migrate.ts', 'scripts/seed.ts']) {
    const result = spawnSync(process.execPath, ['--import', 'tsx', script], { cwd: root, env, stdio: 'inherit' });
    assert.equal(result.status, 0, `${script} failed.`);
  }
  const web = spawn(process.execPath, ['build'], { cwd: root, env, stdio: 'inherit', detached: process.platform !== 'win32', windowsHide: true });
  children.push(web);
  const worker = spawn('uv', ['run', '--frozen', '--project', 'worker', 'python', 'worker/worker.py'], { cwd: root, env, stdio: 'inherit', detached: process.platform !== 'win32', windowsHide: true });
  children.push(worker);
  console.log('Local portal: http://localhost:3000 | persistent data: ./data | stop: Ctrl+C or q + Enter');
  const [code, signal] = await Promise.race(children.map((child) => once(child, 'exit')));
  assert(stopping || code === 0, `A service exited unexpectedly: code=${code}, signal=${signal}`);
} finally {
  await stop();
}

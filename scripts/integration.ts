import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';

const root = process.cwd();
const challengeFiles = (await readdir(resolve(root, 'challenges'), { withFileTypes: true })).filter((entry) => entry.isDirectory());
const challenge = JSON.parse(await readFile(resolve(root, 'challenges', challengeFiles[0].name, 'challenge.json'), 'utf8'));
const slug: string = challenge.slug;
assert.match(slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const [primaryTrack, secondaryTrack] = challenge.tracks;
const primaryTrackId: string = primaryTrack.id;
await mkdir(resolve(root, '.test-runtime'), { recursive: true });
const runtime = await mkdtemp(resolve(root, '.test-runtime/integration-'));
const origin = 'http://localhost:3100';
const database = new EmbeddedPostgres({ databaseDir: resolve(runtime, 'postgres'), user: 'portal', password: 'integration-only', port: 55439, persistent: false, onLog: () => {}, onError: (message) => console.error(message) });
const env = { ...process.env, DATABASE_URL: 'postgresql://portal:integration-only@127.0.0.1:55439/portal', BETTER_AUTH_SECRET: 'integration-secret-at-least-thirty-two-characters', ORIGIN: origin, BETTER_AUTH_URL: origin, DEMO_MODE: 'true', ADMIN_EMAILS: 'demo@example.test', BUILD_DIR: resolve(runtime, 'build'), UPLOAD_DIR: resolve(runtime, 'uploads'), GROUND_TRUTH_DIR: resolve(root, 'examples', slug, 'private'), CHALLENGES_DIR: resolve(runtime, 'challenges'), PORT: '3100', HOST: '127.0.0.1', BODY_SIZE_LIMIT: '12M' };
const client = new pg.Client({ connectionString: env.DATABASE_URL });
const webDatabaseUrl = 'postgresql://portal_web:integration-web-password-only@127.0.0.1:55439/portal';
const workerDatabaseUrl = 'postgresql://portal_worker:integration-worker-password-only@127.0.0.1:55439/portal';
let web: ChildProcess;
let started = false;
let connected = false;

function run(command: string, args: string[], cwd = root) {
  const databaseUrl = args.includes('worker.py') ? workerDatabaseUrl : args.includes('scripts/seed.ts') ? webDatabaseUrl : env.DATABASE_URL;
  const result = spawnSync(command, args, { cwd, env: { ...env, DATABASE_URL: databaseUrl, WEB_DATABASE_PASSWORD: 'integration-web-password-only', WORKER_DATABASE_PASSWORD: 'integration-worker-password-only', TEST_BASE_URL: origin }, encoding: 'utf8', timeout: 120_000 });
  assert.equal(result.status, 0, `${command} ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}\n${String(result.error ?? '')}`);
  return result.stdout;
}

async function upload(cookie: string, filename: string, contents: Uint8Array, trackId = primaryTrackId, signal?: AbortSignal) {
  const data = new FormData();
  data.set('trackId', trackId);
  data.set('file', new Blob([new Uint8Array(contents)], { type: 'application/octet-stream' }), filename);
  return fetch(`${origin}/api/challenges/${slug}/submissions`, { method: 'POST', headers: { Cookie: cookie, Origin: origin }, body: data, signal });
}

try {
  await cp(resolve(root, 'challenges'), resolve(runtime, 'challenges'), { recursive: true });
  const challengePath = resolve(runtime, 'challenges', slug, 'challenge.json');
  const testChallenge = JSON.parse(await readFile(challengePath, 'utf8'));
  testChallenge.dailyLimit = 3;
  await writeFile(challengePath, JSON.stringify(testChallenge));
  await database.initialise();
  await database.start();
  started = true;
  await database.createDatabase('portal');
  await client.connect();
  connected = true;
  run(process.execPath, ['--import', 'tsx', 'scripts/migrate.ts']);
  run(process.execPath, ['--import', 'tsx', 'scripts/provision-db.ts']);
  for (const [connectionString, expectedRole] of [[webDatabaseUrl, 'portal_web'], [workerDatabaseUrl, 'portal_worker']]) {
    const restricted = new pg.Client({ connectionString });
    await restricted.connect();
    try {
      const role = await restricted.query('SELECT current_user, rolsuper FROM pg_roles WHERE rolname = current_user');
      assert.equal(role.rows[0].current_user, expectedRole);
      assert.equal(role.rows[0].rolsuper, false);
      await assert.rejects(restricted.query('CREATE TABLE public.forbidden (id integer)'), { code: '42501' });
      if (expectedRole === 'portal_worker') {
        await assert.rejects(restricted.query('SELECT * FROM account'), { code: '42501' });
        await assert.rejects(restricted.query('DELETE FROM submissions WHERE false'), { code: '42501' });
      }
    } finally { await restricted.end(); }
  }
  run(process.execPath, ['--import', 'tsx', 'scripts/seed.ts']);
  const seededUser = await client.query('SELECT id FROM "user" WHERE email = $1', ['demo@example.test']);
  await client.query(`INSERT INTO account (id, account_id, provider_id, user_id, access_token, refresh_token)
    VALUES ('encryption-test', 'test-account', 'test-provider', $1, 'test-access-token', 'test-refresh-token')`, [seededUser.rows[0].id]);
  run(process.execPath, ['--import', 'tsx', 'scripts/encrypt-oauth-tokens.ts']);
  const encrypted = await client.query("SELECT access_token, refresh_token FROM account WHERE id = 'encryption-test'");
  assert.notEqual(encrypted.rows[0].access_token, 'test-access-token');
  assert.notEqual(encrypted.rows[0].refresh_token, 'test-refresh-token');
  run(process.execPath, ['--import', 'tsx', 'scripts/encrypt-oauth-tokens.ts']);
  const repeated = await client.query("SELECT access_token, refresh_token FROM account WHERE id = 'encryption-test'");
  assert.deepEqual(repeated.rows, encrypted.rows);
  await client.query("DELETE FROM account WHERE id = 'encryption-test'");
  run(process.execPath, ['node_modules/vite/bin/vite.js', 'build']);
  web = spawn(process.execPath, [env.BUILD_DIR], { cwd: root, env: { ...env, DATABASE_URL: webDatabaseUrl }, stdio: 'inherit', windowsHide: true });
  const deadline = Date.now() + 30_000;
  while (true) {
    assert.ok(web.exitCode === null, 'Website exited before becoming healthy');
    const healthy = await fetch(`${origin}/api/health`).then(async (response) => { await response.arrayBuffer(); return response.ok; }, () => false);
    if (healthy) break;
    assert.ok(Date.now() < deadline, 'Website readiness timed out');
    await new Promise((done) => setTimeout(done, 250));
  }

  const unauthorized = await upload('', 'submission.zip', new Uint8Array([1, 2, 3]));
  assert.equal(unauthorized.status, 401, await unauthorized.text());
  const guestAdmin = await fetch(`${origin}/challenges/${slug}/admin`);
  assert.equal(guestAdmin.status, 401, await guestAdmin.text());
  const home = await fetch(`${origin}/challenges/${slug}`);
  const securityHeaders = Object.fromEntries(home.headers);
  await home.arrayBuffer();
  assert.match(securityHeaders['content-security-policy'], /script-src 'self' 'nonce-/);
  assert.match(securityHeaders['content-security-policy'], /frame-ancestors 'none'/);
  assert.equal(securityHeaders['x-content-type-options'], 'nosniff');
  assert.equal(securityHeaders['x-frame-options'], 'DENY');
  assert.match(securityHeaders['permissions-policy'], /camera=\(\)/);
  const signUp = await fetch(`${origin}/api/auth/sign-up/email`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'participant@example.test', name: 'Participant', password: 'Participant-test-only-2026!' })
  });
  assert.ok(signUp.ok, await signUp.text());
  const participantCookie = signUp.headers.getSetCookie().map((entry) => entry.split(';')[0]).join('; ');
  assert.ok(participantCookie);
  const participantAdmin = await fetch(`${origin}/challenges/${slug}/admin`, { headers: { Cookie: participantCookie } });
  assert.equal(participantAdmin.status, 403, await participantAdmin.text());
  const participantUpload = await upload(participantCookie, 'submission.zip', new Uint8Array([1, 2, 3]));
  assert.equal(participantUpload.status, 403, await participantUpload.text());
  const login = await fetch(`${origin}/api/demo/login`, { method: 'POST', headers: { Origin: origin } });
  assert.ok(login.ok, await login.text());
  const cookie = login.headers.getSetCookie().map((entry) => entry.split(';')[0]).join('; ');
  assert.ok(cookie.length > 0, 'Demo login must create a session cookie');
  assert.match(login.headers.getSetCookie().join(';'), /HttpOnly/i);
  assert.match(login.headers.getSetCookie().join(';'), /SameSite=Lax/i);
  const invalidRetry = await fetch(`${origin}/challenges/${slug}/admin?/retry`, {
    method: 'POST', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id: '-'.repeat(36) })
  });
  assert.equal(invalidRetry.status, 400, await invalidRetry.text());
  for (const foreignOrigin of ['https://attacker.example', 'null', '']) {
    const blocked = await fetch(`${origin}/challenges/${slug}/team?/leave`, {
      method: 'POST', headers: { Cookie: cookie, ...(foreignOrigin ? { Origin: foreignOrigin } : {}), 'Content-Type': 'application/json' }, body: '{}'
    });
    assert.equal(blocked.status, 403, 'Non-form POSTs must also require the portal origin');
    await blocked.arrayBuffer();
    for (const path of ['/api/logout', '/api/demo/login', '/api/login/github', '/api/challenges/${slug}/submissions']) {
      const blocked = await fetch(`${origin}${path}`, { method: 'POST', headers: { Cookie: cookie, ...(foreignOrigin ? { Origin: foreignOrigin } : {}) } });
      assert.equal(blocked.status, 403, await blocked.text());
    }
  }
  const team = await fetch(`${origin}/challenges/${slug}/team?/create`, { method: 'POST', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ name: 'Integration Team' }), redirect: 'manual' });
  assert.ok([200, 303].includes(team.status), await team.text());
  const duplicateTeam = await fetch(`${origin}/challenges/${slug}/team?/create`, { method: 'POST', headers: { Cookie: participantCookie, Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ name: 'Integration Team' }) });
  assert.equal(duplicateTeam.status, 409, await duplicateTeam.text());
  const privateTeam = await fetch(`${origin}/challenges/${slug}/team`, { headers: { Cookie: cookie } });
  assert.equal(Object.fromEntries(privateTeam.headers)['cache-control'], 'private, no-store');
  await privateTeam.arrayBuffer();
  const [{ invite_code }] = (await client.query('SELECT invite_code FROM teams')).rows;
  const otherTeam = await fetch(`${origin}/challenges/${slug}/team`, { headers: { Cookie: participantCookie } });
  assert.ok(otherTeam.ok);
  assert.ok(!(await otherTeam.text()).includes(invite_code), 'Invitation codes must remain private to team members');
  for (const action of ['create', 'join']) {
    await client.query('BEGIN');
    await client.query(`UPDATE challenges SET phase = 'frozen', frozen_at = now() WHERE slug = '${slug}'`);
    const pendingRegistration = fetch(`${origin}/challenges/${slug}/team?/${action}`, {
      method: 'POST', headers: { Cookie: participantCookie, Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(action === 'create' ? { name: 'Registration Race Team' } : { inviteCode: invite_code })
    });
    const registrationDeadline = Date.now() + 5_000;
    while (true) {
      const blocked = await client.query(`SELECT EXISTS (
        SELECT FROM pg_locks WHERE NOT granted AND pg_backend_pid() = ANY(pg_blocking_pids(pid))
      ) AS waiting`);
      if (blocked.rows[0].waiting) break;
      assert.ok(Date.now() < registrationDeadline, `${action} must wait for the organizer's challenge lock`);
      await new Promise((done) => setTimeout(done, 25));
    }
    await client.query('COMMIT');
    const response = await pendingRegistration;
    assert.equal(response.status, 409, `${action} must recheck registration after the freeze commits`);
    await response.arrayBuffer();
    const registration = await client.query(`SELECT count(*)::int AS count FROM memberships
      JOIN "user" ON "user".id = memberships.user_id WHERE "user".email = 'participant@example.test'`);
    assert.equal(registration.rows[0].count, 0, 'A registration racing with the freeze must not create a membership');
    const raceTeams = await client.query("SELECT count(*)::int AS count FROM teams WHERE name = 'Registration Race Team'");
    assert.equal(raceTeams.rows[0].count, 0, 'A registration racing with the freeze must not create a team');
    await client.query(`UPDATE challenges SET phase = 'public', frozen_at = NULL WHERE slug = '${slug}'`);
  }
  const wrongType = await upload(cookie, 'predictions.csv', new TextEncoder().encode('id,sequence\nx,ACGT\n'));
  assert.equal(wrongType.status, 400, await wrongType.text());
  const tooLarge = await upload(cookie, 'large.zip', new Uint8Array(10 * 1024 * 1024 + 1));
  assert.equal(tooLarge.status, 413, await tooLarge.text());
  const filesAfterRejections = await readdir(env.UPLOAD_DIR);
  for (const [contentType, body] of [
    ['multipart/form-data; boundary="', 'invalid boundary'],
    ['multipart/form-data; boundary=truncated', '--truncated\r\nContent-Disposition: form-data; name="file"; filename="broken.zip"\r\n\r\nPKunfinished']
  ]) {
    const malformed = await fetch(`${origin}/api/challenges/${slug}/submissions`, {
      method: 'POST', headers: { Cookie: cookie, Origin: origin, 'Content-Type': contentType }, body
    });
    assert.equal(malformed.status, 400, await malformed.text());
    assert.deepEqual(await readdir(env.UPLOAD_DIR), filesAfterRejections, 'Malformed uploads must remove temporary files');
  }
  const unknownTrack = await upload(cookie, 'unknown-track.zip', new Uint8Array([80, 75, 0, 0]), 'unknown-track');
  assert.equal(unknownTrack.status, 400, await unknownTrack.text());
  assert.deepEqual(await readdir(env.UPLOAD_DIR), filesAfterRejections, 'Rejected track selections must remove uploaded files');

  const archivePath = resolve(runtime, 'perfect.zip');
  run('uv', ['run', '--project', 'worker', 'python', '-c', 'import pathlib,sys,zipfile; source=pathlib.Path(sys.argv[1]); target=pathlib.Path(sys.argv[2]); z=zipfile.ZipFile(target,"w",zipfile.ZIP_DEFLATED); z.write(source,"predictions.csv"); z.close()', resolve(env.GROUND_TRUTH_DIR, 'reference.csv'), archivePath]);
  await client.query('BEGIN');
  await client.query(`SELECT slug FROM challenges WHERE slug = '${slug}' FOR SHARE`);
  const valid = await upload(cookie, 'perfect.zip', await readFile(archivePath), primaryTrackId, AbortSignal.timeout(5_000));
  assert.ok(valid.ok, await valid.text());
  await client.query('COMMIT');
  run('uv', ['run', '--frozen', 'python', 'worker.py', '--once'], resolve(root, 'worker'));
  const completed = await client.query("SELECT * FROM submissions WHERE status = 'completed'");
  assert.equal(completed.rowCount, 1, 'Perfect submission should complete');
  assert.equal(completed.rows[0].metrics.accuracy, 1);
  assert.equal(completed.rows[0].metrics.levenshtein_distance, 0);
  assert.equal(completed.rows[0].metrics.exact_match_rate, 1);
  const leaderboard = await fetch(`${origin}/challenges/${slug}/leaderboard`);
  assert.ok(leaderboard.ok);
  assert.match(await leaderboard.text(), /Integration Team/);

  const archivedTeam = await client.query(`INSERT INTO teams (challenge_slug, name, owner_id, invite_code)
    SELECT challenge_slug, 'Archived Dataset Team', user_id, gen_random_uuid()::text
    FROM submissions WHERE id = $1 RETURNING id`, [completed.rows[0].id]);
  const archivedSubmission = await client.query(`INSERT INTO submissions
    (id, challenge_slug, track_id, team_id, user_id, original_name, storage_name, sha256, bytes, status, dataset_version, accepted_at, completed_at, metrics)
    SELECT gen_random_uuid(), challenge_slug, track_id, $2, user_id, original_name, storage_name, sha256, bytes,
      'completed', 'old-dataset', accepted_at, completed_at, metrics
    FROM submissions WHERE id = $1 RETURNING id`, [completed.rows[0].id, archivedTeam.rows[0].id]);
  const additionalTrack = await client.query(`INSERT INTO submissions
    (id, challenge_slug, track_id, team_id, user_id, original_name, storage_name, sha256, bytes, status, dataset_version, accepted_at, completed_at, metrics)
    SELECT gen_random_uuid(), challenge_slug, track.id, team_id, user_id, original_name, storage_name, sha256, bytes,
      'completed', dataset_version, accepted_at, completed_at, $3::jsonb
    FROM submissions CROSS JOIN unnest($2::text[]) AS track(id) WHERE submissions.id = $1 RETURNING submissions.id`, [completed.rows[0].id, testChallenge.tracks.slice(1).map((track: { id: string }) => track.id),
      JSON.stringify({ accuracy: 0.5, exact_match_rate: 0.5, levenshtein_similarity: 0.5, levenshtein_distance: 8, rows: 12 })]);
  const rankedTeams = await client.query(`INSERT INTO teams (challenge_slug, name, owner_id, invite_code)
    SELECT challenge_slug, name, user_id, gen_random_uuid()::text
    FROM submissions CROSS JOIN unnest(ARRAY['Tied Team', 'Third Team', 'Failed Team']) AS fixture(name)
    WHERE submissions.id = $1 RETURNING id`, [completed.rows[0].id]);
  const rankedSubmissions = await client.query(`INSERT INTO submissions
    (id, challenge_slug, track_id, team_id, user_id, original_name, storage_name, sha256, bytes, status, dataset_version, accepted_at, completed_at, metrics)
    SELECT gen_random_uuid(), s.challenge_slug, s.track_id, t.id, s.user_id, s.original_name, s.storage_name, s.sha256, s.bytes,
      CASE WHEN t.name = 'Failed Team' THEN 'failed' ELSE 'completed' END, s.dataset_version, s.accepted_at, s.completed_at,
      CASE WHEN t.name = 'Failed Team' THEN NULL WHEN t.name = 'Tied Team' THEN s.metrics ELSE $3::jsonb END
    FROM submissions s CROSS JOIN teams t WHERE s.id = $1 AND t.id = ANY($2::uuid[]) RETURNING id`,
    [completed.rows[0].id, rankedTeams.rows.map((row) => row.id),
      JSON.stringify({ accuracy: 0.5, exact_match_rate: 0.5, levenshtein_similarity: 0.5, levenshtein_distance: 8, rows: 12 })]);
  for (const phase of ['public', 'frozen', 'final']) {
    await client.query(`UPDATE challenges SET phase = $1, frozen_at = CASE WHEN $1 = 'public' THEN NULL ELSE now() END WHERE slug = '${slug}'`, [phase]);
    for (const suffix of ['', `?track=${primaryTrackId}`]) {
      const response = await fetch(`${origin}/challenges/${slug}/leaderboard${suffix}`);
      assert.ok(response.ok);
      const html = await response.text();
      assert.doesNotMatch(html, /Archived Dataset Team/, `${phase} rankings must exclude previous datasets`);
      assert.match(html, /Integration Team/);
      if (!suffix) {
        assert.match(html, /class="numeric primary-score">66\.67%/, 'Overall rankings must aggregate all three tracks');
        assert.match(html, /class="coverage-badge coverage-complete">3 \/ 3/);
      } else {
        assert.equal([...html.matchAll(/aria-label="First place"/g)].length, 2, 'Equal scores share first place');
        assert.doesNotMatch(html, /aria-label="Second place"/, 'Rankings skip positions after a tie');
        assert.equal([...html.matchAll(/aria-label="Third place"/g)].length, 1);
        assert.equal(html.includes('Failed Team'), phase === 'final', 'Failed final submissions remain visible without a rank');
      }
    }
  }
  await client.query(`UPDATE challenges SET phase = 'public', frozen_at = NULL WHERE slug = '${slug}'`);
  await client.query('DELETE FROM submissions WHERE id = ANY($1::uuid[])', [[archivedSubmission.rows[0].id, ...additionalTrack.rows.map((row) => row.id), ...rankedSubmissions.rows.map((row) => row.id)]]);
  await client.query('DELETE FROM teams WHERE id = ANY($1::uuid[])', [[archivedTeam.rows[0].id, ...rankedTeams.rows.map((row) => row.id)]]);

  const duplicatePath = resolve(runtime, 'duplicate.zip');
  run('uv', ['run', '--project', 'worker', 'python', '-c', 'import csv,io,sys,zipfile; row=next(csv.DictReader(open(sys.argv[1]))); out=io.StringIO(); w=csv.DictWriter(out,fieldnames=["id","sequence"]); w.writeheader(); w.writerow(row); w.writerow(row); z=zipfile.ZipFile(sys.argv[2],"w",zipfile.ZIP_DEFLATED); z.writestr("predictions.csv",out.getvalue()); z.close()', resolve(env.GROUND_TRUTH_DIR, 'reference.csv'), duplicatePath]);
  const duplicate = await upload(cookie, 'duplicate.zip', await readFile(duplicatePath));
  assert.ok(duplicate.ok, await duplicate.text());
  run('uv', ['run', '--frozen', 'python', 'worker.py', '--once'], resolve(root, 'worker'));
  const rejected = await client.query("SELECT * FROM submissions WHERE status = 'rejected'");
  assert.equal(rejected.rowCount, 1, 'Duplicate IDs must be rejected');
  assert.match(rejected.rows[0].error, /duplicate/i);

  const perfect = await readFile(archivePath);
  if (process.argv.includes('--browser')) {
    const historyIds: string[] = [];
    for (const [filename, daysAgo, score, edits, oldDataset] of [
      ['earlier.zip', 3, 0.75, 8, false], ['regression.zip', 2, 0.60, 10, false], ['archived.zip', 1, 0.99, 1, true]
    ] as const) {
      const fixture = await client.query(`INSERT INTO submissions
        (id, challenge_slug, track_id, team_id, user_id, original_name, storage_name, sha256, bytes, status, dataset_version, created_at, accepted_at, completed_at, metrics)
        SELECT gen_random_uuid(), challenge_slug, track_id, team_id, user_id, $2, storage_name, sha256, bytes, 'completed',
          CASE WHEN $5 THEN 'old-dataset' ELSE dataset_version END,
          created_at - $3 * INTERVAL '1 day', accepted_at - $3 * INTERVAL '1 day', completed_at - $3 * INTERVAL '1 day', $4::jsonb
        FROM submissions WHERE id = $1 RETURNING id`,
      [completed.rows[0].id, filename, daysAgo, JSON.stringify({ accuracy: score, exact_match_rate: score, levenshtein_similarity: score, levenshtein_distance: edits, rows: 12 }), oldDataset]);
      historyIds.push(fixture.rows[0].id);
    }
    const browser = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test'], { cwd: root, env: { ...env, TEST_BASE_URL: origin, PORTAL_INTEGRATION_BROWSER: 'true' }, stdio: 'inherit' });
    const [code] = await once(browser, 'exit');
    assert.equal(code, 0, 'Browser regression tests failed');
    await client.query(`UPDATE challenges SET phase = 'frozen', frozen_at = (SELECT completed_at - INTERVAL '36 hours' FROM submissions WHERE id = $1) WHERE slug = '${slug}'`, [completed.rows[0].id]);
    for (const phase of ['frozen', 'final']) {
      await client.query(`UPDATE challenges SET phase = $1 WHERE slug = '${slug}'`, [phase]);
      const response = await fetch(`${origin}/challenges/${slug}/leaderboard?track=${primaryTrackId}`);
      assert.ok(response.ok);
      const html = await response.text();
      assert.match(html, /aria-label="Integration Team: 75\.00%/);
      assert.doesNotMatch(html, /aria-label="Integration Team: (100|99|60)\.00%/);
      assert.doesNotMatch(html, /earlier\.zip|regression\.zip|archived\.zip|perfect\.zip/);
    }
    await client.query(`UPDATE challenges SET phase = 'public', frozen_at = NULL WHERE slug = '${slug}'`);
    await client.query('DELETE FROM submissions WHERE id = ANY($1::uuid[])', [historyIds]);
  }
  const parallel = await Promise.all([upload(cookie, 'quota-one.zip', perfect), upload(cookie, 'quota-two.zip', perfect)]);
  assert.equal(parallel.filter((response) => response.ok).length, 1, 'Only one concurrent upload may take the final quota slot');
  assert.equal(parallel.filter((response) => response.status === 429).length, 1, 'The other concurrent upload must receive a quota error');
  await Promise.all(parallel.map((response) => response.arrayBuffer()));
  const total = await client.query('SELECT count(*)::int AS count FROM submissions');
  assert.equal(total.rows[0].count, 3, 'Quota must hold under concurrent uploads');
  const filesBefore = (await readdir(env.UPLOAD_DIR)).sort();
  const exhausted = await fetch(`${origin}/api/challenges/${slug}/submissions`, { method: 'POST', headers: { Cookie: cookie, Origin: origin }, body: 'not even multipart' });
  assert.equal(exhausted.status, 429, 'Exhausted quotas must be rejected before reading an archive');
  await exhausted.arrayBuffer();
  assert.deepEqual((await readdir(env.UPLOAD_DIR)).sort(), filesBefore);

  await client.query(`UPDATE challenges SET phase = 'frozen', frozen_at = '2000-01-01T00:00:00Z' WHERE slug = '${slug}'`);
  const privateBoard = await fetch(`${origin}/challenges/${slug}/leaderboard`);
  assert.ok(privateBoard.ok);
  assert.doesNotMatch(await privateBoard.text(), /Integration Team/);
  const frozenProgress = await fetch(`${origin}/challenges/${slug}/leaderboard?track=${primaryTrackId}`);
  const frozenHtml = await frozenProgress.text();
  assert.ok(frozenProgress.ok);
  assert.match(frozenHtml, /No public score history for this track yet/);
  assert.doesNotMatch(frozenHtml, /Integration Team/);
  await client.query(`UPDATE challenges SET phase = 'final' WHERE slug = '${slug}'`);
  const finalProgress = await fetch(`${origin}/challenges/${slug}/leaderboard?track=${primaryTrackId}`);
  assert.ok(finalProgress.ok);
  assert.match(await finalProgress.text(), /No public score history for this track yet/);
  const attempts = [];
  for (let index = 0; index < 4; index++) {
    attempts.push(await fetch(`${origin}/api/demo/login`, { method: 'POST', headers: {
      Origin: origin, 'X-Forwarded-For': `192.0.2.${index + 1}`, 'X-Real-IP': `198.51.100.${index + 1}`, 'X-Portal-Client-IP': `203.0.113.${index + 1}`
    } }));
  }
  assert.ok(attempts.some((response) => response.status === 429), 'Login wrappers must rate limit even when clients spoof IP headers');
  await Promise.all(attempts.map((response) => response.arrayBuffer()));
  const logout = await fetch(`${origin}/api/logout`, { method: 'POST', headers: { Cookie: cookie, Origin: origin } });
  assert.ok(logout.ok, await logout.text());
  const revokedAdmin = await fetch(`${origin}/challenges/${slug}/admin`, { headers: { Cookie: cookie } });
  assert.equal(revokedAdmin.status, 401, await revokedAdmin.text());
  console.log('Integration passed: security headers, CSRF, permissions, session revocation, spoof-resistant login limits, private team data, upload limits, scoring, concurrent quotas, and frozen leaderboard cutoff.');
} finally {
  if (web! && web.exitCode === null) {
    web.kill();
    await once(web, 'exit');
  }
  if (connected) await client.end();
  if (started) await database.stop();
  await rm(runtime, { recursive: true, force: true });
}

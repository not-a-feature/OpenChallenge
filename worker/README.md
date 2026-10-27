# Worker

```sh
# From repository root; database migrations belong to the web application.
uv run --frozen --env-file .env --project worker python worker/worker.py
uv run --frozen --env-file .env --project worker python worker/worker.py --once
uv run --frozen --project worker python -m pytest worker/tests
```

- Required env: `DATABASE_URL`, `UPLOAD_DIR`, `GROUND_TRUTH_DIR`.
- `CHALLENGES_DIR`: defaults to repository `challenges/`.
- `POLL_SECONDS=3`, `JOB_TIMEOUT_SECONDS=120`.
- `queued → validating → scoring → completed/rejected/failed`.
- Claim: short `FOR UPDATE SKIP LOCKED` transaction; commit before computation.
- Validation and scoring run in subprocesses within one shared timeout.
- Reports: 64 KiB maximum. Container imposes memory/CPU limits.
- Lease: timeout + 30s. Expired attempts fail; organizer retries explicitly.
- Updates require matching attempt, claimant and active status.
- Dataset version mismatch fails before scoring; reference/config errors fail operationally.
- Evaluators: fixed trusted registry in `worker.py`; uploads never contain executable code.
- Add scientific evaluators to that registry and version them with their dataset.

## Sequence comparison

- One UTF-8 CSV, header exactly `id,sequence`, inside ZIP or `.tar.gz/.tgz/.tar.bz2/.tar.xz`.
- Unique ids, exact reference id set; row order irrelevant.
- Ids: 1–128 characters, no surrounding whitespace. Strings: 0–512 characters.
- Generic strings; no DNA alphabet constraint. Control characters rejected.
- Limits: 10 MiB compressed, 64 MiB CSV, 65 MiB total TAR, 100,000 rows, 32 entries.
- Safe directory entries allowed; traversal, absolute paths, links, special/sparse files,
  encrypted ZIP, extra files and malformed CSV rejected. Stream members; never extract.
- Verify accepted upload SHA-256 before comparison.

| Metric | Per-row definition; average rows with equal weight |
|---|---|
| `accuracy` | Identical-position matches / max string length |
| `exact_match_rate` | 1 if strings identical, otherwise 0 |
| `levenshtein_distance` | Unit-cost insertions, deletions and substitutions |
| `levenshtein_similarity` | 1 − edit distance / max string length |

Both empty: accuracy/similarity/exact match 1, distance 0. One empty: accuracy/similarity
0, distance equal to other length. Positional accuracy does not realign insertions.

Example fixtures are synthetic; they do not reproduce paper datasets, embeddings or
reported scores. Replace the worker-only reference mount and dataset version for real use.

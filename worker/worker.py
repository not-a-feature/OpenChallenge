"""Poll PostgreSQL for submissions and execute the configured trusted evaluator."""

import argparse
import json
import math
import os
import re
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from comparator import EVALUATOR_VERSION

MAX_REPORT_BYTES = 64 * 1024
EVALUATORS = {"sequence": Path(__file__).with_name("comparator.py")}


def owned_path(directory: Path, relative: str) -> Path:
    result = (directory / relative).resolve()
    assert result.is_relative_to(directory.resolve()), "Configured file escapes its storage directory."
    return result


def claim_job(connection, worker_id: uuid.UUID, timeout_seconds: int):
    with connection.transaction():
        connection.execute(
            """UPDATE submissions SET status = 'failed', error = 'Worker lease expired; an organizer can retry this submission.',
               completed_at = NOW(), lease_until = NULL
               WHERE status IN ('validating', 'scoring') AND lease_until < NOW()"""
        )
        return connection.execute(
            """WITH candidate AS (
                 SELECT id FROM submissions WHERE status = 'queued' ORDER BY created_at, id
                 FOR UPDATE SKIP LOCKED LIMIT 1
               )
               UPDATE submissions AS s SET status = 'validating', attempt = s.attempt + 1,
                 claimed_by = %s, lease_until = NOW() + (%s * INTERVAL '1 second'),
                 started_at = NOW(), completed_at = NULL, error = NULL, metrics = NULL
               FROM candidate WHERE s.id = candidate.id RETURNING s.*""",
            (worker_id, timeout_seconds + 30),
        ).fetchone()


def update_job(connection, job: dict, status: str, *, metrics=None, error: str = ""):
    terminal = status in {"completed", "rejected", "failed"}
    connection.execute(
        """UPDATE submissions SET status = %s, metrics = %s, error = %s,
             evaluator_version = %s, dataset_version = %s,
             completed_at = CASE WHEN %s THEN NOW() ELSE NULL END,
             lease_until = CASE WHEN %s THEN NULL ELSE lease_until END
           WHERE id = %s AND attempt = %s AND claimed_by = %s AND status IN ('validating', 'scoring')""",
        (status, Jsonb(metrics) if metrics else None, error or None, EVALUATOR_VERSION,
         job["dataset_version"], terminal, terminal, job["id"], job["attempt"], job["claimed_by"]),
    )


def execute_job(connection, job: dict, uploads: Path, references: Path, challenges: Path, timeout_seconds: int):
    assert re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", job["challenge_slug"]), "Invalid challenge slug in database."
    config_path = owned_path(challenges, f'{job["challenge_slug"]}/challenge.json')
    config = json.loads(config_path.read_text(encoding="utf-8"))
    if job["dataset_version"] != config["datasetVersion"]:
        update_job(connection, job, "failed", error="Dataset version changed after submission; organizer inspection is required.")
        return
    evaluator = EVALUATORS[config["evaluator"]]
    tracks = {track["id"]: track for track in config["tracks"]}
    track = tracks[job["track_id"]]
    reference = owned_path(references, track["referenceFile"])
    assert reference.is_file(), "Configured reference file is missing."
    assert re.fullmatch(r"[a-zA-Z0-9_.-]+", job["storage_name"]), "Invalid storage filename in database."
    upload = owned_path(uploads, job["storage_name"])
    command = [sys.executable, "-I", str(evaluator), "--archive", str(upload), f'--original-name={job["original_name"]}',
               "--reference", str(reference), "--expected-rows", str(track["expectedRows"]), "--sha256", job["sha256"]]
    deadline = time.monotonic() + timeout_seconds
    for status, options in [("validating", ["--validate-only"]), ("scoring", [])]:
        update_job(connection, job, status)
        with tempfile.TemporaryFile() as output, tempfile.TemporaryFile() as errors:
            remaining_seconds = deadline - time.monotonic()
            if remaining_seconds <= 0:
                update_job(connection, job, "failed", error=f"Evaluation exceeded its {timeout_seconds}s runtime limit.")
                return
            try:
                result = subprocess.run(command + options, stdout=output, stderr=errors, timeout=remaining_seconds, check=False,
                                        env={key: value for key, value in os.environ.items()
                                             if key in {"PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "TMPDIR", "LANG", "LC_ALL"}})
            except subprocess.TimeoutExpired:
                update_job(connection, job, "failed", error=f"Evaluation exceeded its {timeout_seconds}s runtime limit.")
                return
            output.seek(0)
            errors.seek(0)
            report = output.read(MAX_REPORT_BYTES + 1)
            diagnostics = errors.read(MAX_REPORT_BYTES + 1)
            if len(report) > MAX_REPORT_BYTES or len(diagnostics) > MAX_REPORT_BYTES:
                update_job(connection, job, "failed", error="Evaluator exceeded its report size limit.")
                return
            if result.returncode == 2:
                update_job(connection, job, "rejected", error=json.loads(report)["error"])
                return
            if result.returncode != 0:
                print(diagnostics.decode("utf-8", errors="replace"), file=sys.stderr, flush=True)
                update_job(connection, job, "failed", error="Evaluator failed. Organizer inspection is required.")
                return
            parsed = json.loads(report)
            assert parsed["evaluator_version"] == EVALUATOR_VERSION
            if status == "scoring":
                metrics = parsed["metrics"]
                assert all(math.isfinite(value) for value in metrics.values()), "Evaluator returned nonfinite metrics."
                assert 0 <= metrics["accuracy"] <= 1 and 0 <= metrics["levenshtein_similarity"] <= 1
                assert 0 <= metrics["exact_match_rate"] <= 1 and metrics["levenshtein_distance"] >= 0
                assert metrics["rows"] == track["expectedRows"]
                update_job(connection, job, "completed", metrics=metrics)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--once", action="store_true", help="Process at most one pending job and exit.")
    arguments = parser.parse_args()
    uploads = Path(os.environ["UPLOAD_DIR"])
    references = Path(os.environ["GROUND_TRUTH_DIR"])
    challenges = Path(os.environ.setdefault("CHALLENGES_DIR", str(Path(__file__).resolve().parent.parent / "challenges")))
    poll_seconds = float(os.environ.setdefault("POLL_SECONDS", "3"))
    timeout_seconds = int(os.environ.setdefault("JOB_TIMEOUT_SECONDS", "120"))
    assert poll_seconds > 0 and timeout_seconds > 0
    worker_id = uuid.uuid4()
    with psycopg.connect(os.environ["DATABASE_URL"], autocommit=True, row_factory=dict_row) as connection:
        while True:
            job = claim_job(connection, worker_id, timeout_seconds)
            if job:
                print(json.dumps({"event": "claimed", "submission": str(job["id"]), "attempt": job["attempt"]}), flush=True)
                execute_job(connection, job, uploads, references, challenges, timeout_seconds)
            if arguments.once:
                return
            if not job:
                time.sleep(poll_seconds)


if __name__ == "__main__":
    main()

import hashlib
import json
import uuid
import zipfile

import pytest

import worker


@pytest.mark.parametrize("original_name", ["predictions.zip", "-predictions.zip"])
def test_evaluator_accepts_upload_filename(tmp_path, monkeypatch, original_name):
    uploads = tmp_path / "uploads"
    references = tmp_path / "references"
    challenges = tmp_path / "challenges"
    uploads.mkdir()
    references.mkdir()
    (challenges / "test").mkdir(parents=True)
    (challenges / "test" / "challenge.json").write_text(json.dumps({
        "datasetVersion": "test-v1", "evaluator": "sequence",
        "tracks": [{"id": "test", "referenceFile": "reference.csv", "expectedRows": 1}],
    }), encoding="utf-8")
    contents = "id,sequence\na,ACGT\n"
    (references / "reference.csv").write_text(contents, encoding="utf-8")
    upload = uploads / "submission.zip"
    with zipfile.ZipFile(upload, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("predictions.csv", contents)
    job = {
        "id": uuid.uuid4(), "attempt": 1, "claimed_by": uuid.uuid4(),
        "challenge_slug": "test", "track_id": "test", "dataset_version": "test-v1",
        "storage_name": upload.name, "original_name": original_name,
        "sha256": hashlib.sha256(upload.read_bytes()).hexdigest(),
    }
    updates = []
    monkeypatch.setattr(worker, "update_job", lambda connection, job, status, **values: updates.append((status, values)))
    worker.execute_job(object(), job, uploads, references, challenges, timeout_seconds=10)
    assert [status for status, values in updates] == ["validating", "scoring", "completed"]
    assert updates[-1][1]["metrics"]["exact_match_rate"] == 1

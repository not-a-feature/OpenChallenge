"""Validate an archived prediction CSV and compare strings to a reference CSV."""

import argparse
import bz2
import csv
import gzip
import hashlib
import io
import json
import lzma
import tarfile
import zipfile
import zlib
from pathlib import Path, PurePosixPath

from rapidfuzz.distance.Levenshtein import distance as levenshtein

MAX_COMPRESSED_BYTES = 10 * 1024 * 1024
MAX_UNCOMPRESSED_BYTES = 64 * 1024 * 1024
MAX_ROWS = 100_000
MAX_STRING_LENGTH = 512
MAX_ID_LENGTH = 128
MAX_ARCHIVE_ENTRIES = 32
MAX_TAR_BYTES = MAX_UNCOMPRESSED_BYTES + 1024 * 1024
EVALUATOR_VERSION = "sequence-v1"


class ValidationError(ValueError):
    """An input violates the submission format or a resource limit."""


class LimitedReader(io.RawIOBase):
    def __init__(self, source, limit: int):
        self.source = source
        self.remaining = limit

    def readable(self):
        return True

    def readinto(self, target):
        data = self.source.read(min(len(target), self.remaining + 1))
        if len(data) > self.remaining:
            raise ValidationError("Decompressed input exceeds its size limit.")
        target[: len(data)] = data
        self.remaining -= len(data)
        return len(data)


def safe_member_name(name: str):
    if not name or "\\" in name or ":" in name or "\x00" in name:
        raise ValidationError("Archive contains an unsafe member path.")
    path = PurePosixPath(name)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in name.rstrip("/").split("/")):
        raise ValidationError("Archive member paths must be relative and cannot contain traversal.")


def read_csv(source, expected_rows: int = 0) -> dict[str, str]:
    csv.field_size_limit(4096)
    with io.TextIOWrapper(io.BufferedReader(LimitedReader(source, MAX_UNCOMPRESSED_BYTES)), encoding="utf-8", newline="") as text:
        reader = csv.reader(text, strict=True)
        header = next(reader, [])
        if header != ["id", "sequence"]:
            raise ValidationError("CSV header must be exactly id,sequence (UTF-8 without BOM).")
        rows = {}
        for line_number, row in enumerate(reader, start=2):
            if len(rows) >= MAX_ROWS:
                raise ValidationError("CSV exceeds 100,000 prediction rows.")
            if len(row) != 2:
                raise ValidationError(f"CSV row {line_number} must contain exactly two columns.")
            identifier, sequence = row
            if not identifier or identifier != identifier.strip() or len(identifier) > MAX_ID_LENGTH:
                raise ValidationError(f"CSV row {line_number} has an empty, padded, or excessively long id.")
            if any(ord(character) < 32 or ord(character) == 127 for character in identifier + sequence):
                raise ValidationError(f"CSV row {line_number} contains control characters.")
            if len(sequence) > MAX_STRING_LENGTH:
                raise ValidationError(f"CSV row {line_number} sequence exceeds 512 characters.")
            if identifier in rows:
                raise ValidationError(f"Duplicate id {identifier!r} at CSV row {line_number}.")
            rows[identifier] = sequence
        if not rows:
            raise ValidationError("CSV must contain at least one prediction row.")
        if expected_rows and len(rows) != expected_rows:
            raise ValidationError(f"Expected {expected_rows} rows, received {len(rows)}.")
        return rows


def read_archive(path: Path, original_name: str, expected_rows: int = 0) -> dict[str, str]:
    if not 0 < path.stat().st_size <= MAX_COMPRESSED_BYTES:
        raise ValidationError("Archive must be nonempty and no larger than 10 MiB.")
    lower_name = original_name.lower()
    try:
        if lower_name.endswith(".zip"):
            with zipfile.ZipFile(path) as archive:
                members = archive.infolist()
                if len(members) > MAX_ARCHIVE_ENTRIES:
                    raise ValidationError("Archive contains too many entries (maximum 32).")
                regular_files = []
                for member in members:
                    safe_member_name(member.filename)
                    if member.flag_bits & 1:
                        raise ValidationError("Encrypted ZIP files are not supported.")
                    file_type = (member.external_attr >> 16) & 0o170000
                    if file_type not in {0, 0o100000, 0o040000}:
                        raise ValidationError("ZIP links and special files are not permitted.")
                    if member.is_dir():
                        continue
                    if file_type == 0o040000:
                        raise ValidationError("ZIP member type does not match its name.")
                    if not member.filename.lower().endswith(".csv"):
                        raise ValidationError("Archive may only contain one CSV and optional directories.")
                    if member.file_size > MAX_UNCOMPRESSED_BYTES:
                        raise ValidationError("Decompressed CSV exceeds 64 MiB.")
                    if member.compress_type not in {zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED, zipfile.ZIP_BZIP2, zipfile.ZIP_LZMA}:
                        raise ValidationError("Unsupported ZIP compression method.")
                    regular_files.append(member)
                if len(regular_files) != 1:
                    raise ValidationError("Archive must contain exactly one regular CSV file.")
                with archive.open(regular_files[0]) as source:
                    return read_csv(source, expected_rows)
        elif lower_name.endswith((".tar.gz", ".tgz", ".tar.bz2", ".tar.xz")):
            rows = {}
            if lower_name.endswith((".tar.gz", ".tgz")):
                decompressor = gzip.open
            elif lower_name.endswith(".tar.xz"):
                decompressor = lzma.open
            else:
                decompressor = bz2.open
            with decompressor(path, "rb") as decoded, io.BufferedReader(LimitedReader(decoded, MAX_TAR_BYTES)) as bounded:
                with tarfile.open(fileobj=bounded, mode="r|") as archive:
                    for index, member in enumerate(archive, start=1):
                        if index > MAX_ARCHIVE_ENTRIES:
                            raise ValidationError("Archive contains too many entries (maximum 32).")
                        safe_member_name(member.name)
                        if member.isdir():
                            if member.size:
                                raise ValidationError("TAR directory entries cannot contain data.")
                            continue
                        if not member.isfile() or member.issparse():
                            raise ValidationError("TAR links, sparse files, and special files are not permitted.")
                        if not member.name.lower().endswith(".csv"):
                            raise ValidationError("Archive may only contain one CSV and optional directories.")
                        if rows:
                            raise ValidationError("Archive must contain exactly one regular CSV file.")
                        if member.size > MAX_UNCOMPRESSED_BYTES:
                            raise ValidationError("Decompressed CSV exceeds 64 MiB.")
                        with archive.extractfile(member) as source:
                            rows = read_csv(source, expected_rows)
                    if not rows:
                        raise ValidationError("Archive must contain exactly one regular CSV file.")
                while bounded.read(64 * 1024):
                    pass
            return rows
        raise ValidationError("Use a .zip, .tar.gz, .tgz, .tar.bz2, or .tar.xz archive.")
    except (zipfile.BadZipFile, tarfile.TarError, gzip.BadGzipFile, EOFError, UnicodeError, csv.Error, zlib.error, lzma.LZMAError) as error:
        raise ValidationError(f"Invalid archive or CSV: {error}") from error
    except OSError as error:
        if error.errno:
            raise
        raise ValidationError(f"Invalid archive or CSV: {error}") from error


def compare(reference: dict[str, str], predictions: dict[str, str]) -> dict[str, float | int]:
    if reference.keys() != predictions.keys():
        missing = reference.keys() - predictions.keys()
        extra = predictions.keys() - reference.keys()
        raise ValidationError(f"Prediction ids do not match reference: {len(missing)} missing, {len(extra)} unknown.")
    assert reference, "Reference dataset must contain at least one row."
    accuracy_total = exact_total = distance_total = similarity_total = 0
    for identifier, truth in reference.items():
        prediction = predictions[identifier]
        length = max(len(truth), len(prediction))
        distance = levenshtein(truth, prediction)
        accuracy_total += sum(a == b for a, b in zip(truth, prediction)) / length if length else 1
        exact_total += truth == prediction
        distance_total += distance
        similarity_total += 1 - distance / length if length else 1
    count = len(reference)
    return {"accuracy": accuracy_total / count, "exact_match_rate": exact_total / count, "levenshtein_distance": distance_total / count, "levenshtein_similarity": similarity_total / count, "rows": count}


def validate(archive: Path, original_name: str, expected_rows: int, expected_sha256: str) -> dict[str, str]:
    if not 0 < archive.stat().st_size <= MAX_COMPRESSED_BYTES:
        raise ValidationError("Archive must be nonempty and no larger than 10 MiB.")
    with archive.open("rb") as source:
        checksum = hashlib.file_digest(source, "sha256").hexdigest()
    if checksum != expected_sha256:
        raise ValidationError("Stored upload checksum does not match its accepted submission.")
    return read_archive(archive, original_name, expected_rows)


def score(archive: Path, original_name: str, reference: Path, expected_rows: int, expected_sha256: str) -> dict:
    predictions = validate(archive, original_name, expected_rows, expected_sha256)
    try:
        with reference.open("rb") as source:
            truths = read_csv(source, expected_rows)
    except ValidationError as error:
        raise RuntimeError(f"Invalid organizer reference dataset: {error}") from error
    return compare(truths, predictions)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--original-name", required=True)
    parser.add_argument("--reference", type=Path, required=True)
    parser.add_argument("--expected-rows", type=int, required=True)
    parser.add_argument("--sha256", required=True)
    parser.add_argument("--validate-only", action="store_true")
    arguments = parser.parse_args()
    try:
        if arguments.validate_only:
            rows = validate(arguments.archive, arguments.original_name, arguments.expected_rows, arguments.sha256)
            print(json.dumps({"rows": len(rows), "evaluator_version": EVALUATOR_VERSION}))
            return
        metrics = score(arguments.archive, arguments.original_name, arguments.reference, arguments.expected_rows, arguments.sha256)
    except ValidationError as error:
        print(json.dumps({"error": str(error)}))
        raise SystemExit(2)
    print(json.dumps({"metrics": metrics, "evaluator_version": EVALUATOR_VERSION}, allow_nan=False))


if __name__ == "__main__":
    main()

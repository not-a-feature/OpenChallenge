import errno
import hashlib
import io
import itertools
import random
import tarfile
import zipfile
from pathlib import Path

import pytest

import comparator
from comparator import ValidationError, compare, levenshtein, read_archive, score


def zip_csv(path, contents="id,sequence\na,ACGT\nb,GG\n", filename="predictions.csv"):
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(filename, contents)
    return path


def tar_csv(path, contents=b"id,sequence\na,ACGT\nb,GG\n", filename="predictions.csv"):
    with tarfile.open(path, "w:gz") as archive:
        member = tarfile.TarInfo(filename)
        member.size = len(contents)
        archive.addfile(member, io.BytesIO(contents))
    return path


def test_metrics_empty_variable_length_and_alignment():
    metrics = compare({"a": "", "b": "ACGT", "c": "AB"}, {"c": "AXB", "a": "", "b": "AGGT"})
    assert metrics["accuracy"] == pytest.approx((1 + 3 / 4 + 1 / 3) / 3)
    assert metrics["levenshtein_distance"] == pytest.approx(2 / 3)
    assert metrics["levenshtein_similarity"] == pytest.approx((1 + 3 / 4 + 2 / 3) / 3)
    assert metrics["exact_match_rate"] == pytest.approx(1 / 3)
    assert metrics["rows"] == 3


def test_known_levenshtein():
    assert levenshtein("kitten", "sitting") == 3
    assert levenshtein("", "ABC") == 3
    assert levenshtein("same", "same") == 0


def test_levenshtein_matches_full_matrix():
    strings = ["".join(characters) for size in range(5) for characters in itertools.product("AB", repeat=size)]
    strings += ["αβγ", "αδγ", "é", "e\u0301", "😀", "A" * 255 + "B" + "A" * 256, "A" * 512]
    pairs = list(itertools.product(strings, repeat=2))
    generator = random.Random(0)
    pairs.extend(("".join(generator.choices("Aαé\u0301漢😀", k=generator.randrange(513))),
                  "".join(generator.choices("Aαé\u0301漢😀", k=generator.randrange(513)))) for _ in range(20))
    for first, second in pairs:
        matrix = [list(range(len(second) + 1))]
        for row, character in enumerate(first, start=1):
            matrix.append([row])
            for column, other in enumerate(second, start=1):
                matrix[row].append(min(matrix[row][-1] + 1, matrix[row - 1][column] + 1,
                                       matrix[row - 1][column - 1] + (character != other)))
        assert levenshtein(first, second) == matrix[-1][-1]


@pytest.mark.parametrize("builder,suffix", [(zip_csv, ".zip"), (tar_csv, ".tar.gz")])
def test_archives(builder, suffix, tmp_path):
    archive = builder(tmp_path / f"upload{suffix}")
    assert read_archive(archive, archive.name, 2) == {"a": "ACGT", "b": "GG"}


@pytest.mark.parametrize("filename", ["../predictions.csv", "/predictions.csv", "C:/predictions.csv", "..\\predictions.csv", "x/../predictions.csv"])
@pytest.mark.parametrize("builder,suffix", [(zip_csv, ".zip"), (tar_csv, ".tar.gz")])
def test_unsafe_paths(builder, suffix, filename, tmp_path):
    archive = builder(tmp_path / f"upload{suffix}", filename=filename)
    with pytest.raises(ValidationError, match="path"):
        read_archive(archive, archive.name)


def test_zip_link(tmp_path):
    path = tmp_path / "link.zip"
    with zipfile.ZipFile(path, "w") as archive:
        member = zipfile.ZipInfo("predictions.csv")
        member.create_system = 3
        member.external_attr = (0o120777 << 16)
        archive.writestr(member, "secret.csv")
    with pytest.raises(ValidationError, match="links"):
        read_archive(path, path.name)


@pytest.mark.parametrize("link_type", [tarfile.SYMTYPE, tarfile.LNKTYPE])
def test_tar_links(tmp_path, link_type):
    path = tmp_path / "link.tar.gz"
    with tarfile.open(path, "w:gz") as archive:
        member = tarfile.TarInfo("predictions.csv")
        member.type = link_type
        member.linkname = "secret.csv"
        archive.addfile(member)
    with pytest.raises(ValidationError, match="links"):
        read_archive(path, path.name)


def test_extra_members(tmp_path):
    path = zip_csv(tmp_path / "extra.zip")
    with zipfile.ZipFile(path, "a") as archive:
        archive.writestr("extra.csv", "id,sequence\nc,C\n")
    with pytest.raises(ValidationError, match="exactly one"):
        read_archive(path, path.name)


@pytest.mark.parametrize("contents,match", [
    ("identifier,sequence\na,AC\n", "header"),
    ("id,sequence\na,A\na,C\n", "Duplicate"),
    ("id,sequence\na,A,x\n", "two columns"),
    ("id,sequence\n", "at least one"),
    ("id,sequence\n a,A\n", "padded"),
    ("id,sequence\na," + "A" * 513 + "\n", "512"),
    ("id,sequence\na,\"A\nB\"\n", "control"),
    ("id,sequence\na,\"unterminated", "Invalid archive or CSV"),
])
def test_invalid_csv(tmp_path, contents, match):
    path = zip_csv(tmp_path / "bad.zip", contents)
    with pytest.raises(ValidationError, match=match):
        read_archive(path, path.name)


def test_mismatched_ids_and_row_count(tmp_path):
    with pytest.raises(ValidationError, match="1 missing, 1 unknown"):
        compare({"a": "A"}, {"b": "A"})
    path = zip_csv(tmp_path / "rows.zip")
    with pytest.raises(ValidationError, match="Expected 3 rows"):
        read_archive(path, path.name, 3)


@pytest.mark.parametrize("suffix", [".zip", ".tar.gz", ".tgz", ".tar.bz2", ".tar.xz"])
def test_malformed_archives(tmp_path, suffix):
    path = tmp_path / f"bad{suffix}"
    path.write_bytes(b"not an archive")
    with pytest.raises(ValidationError, match="Invalid archive"):
        read_archive(path, path.name)


def test_corrupt_bzip2_zip_is_rejected(tmp_path):
    path = tmp_path / "corrupt.zip"
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_BZIP2) as archive:
        archive.writestr("predictions.csv", "id,sequence\na,ACGT\n")
        member = archive.infolist()[0]
        payload_offset = member.header_offset + 30 + len(member.filename.encode("utf-8")) + len(member.extra)
    contents = bytearray(path.read_bytes())
    contents[payload_offset] = 0
    path.write_bytes(contents)
    with pytest.raises(ValidationError, match="Invalid archive"):
        read_archive(path, path.name)


def test_archive_io_errors_remain_operational(tmp_path, monkeypatch):
    path = zip_csv(tmp_path / "upload.zip")

    def denied_archive(*args):
        raise PermissionError(errno.EACCES, "Storage is inaccessible")

    monkeypatch.setattr(zipfile, "ZipFile", denied_archive)
    with pytest.raises(PermissionError, match="Storage is inaccessible"):
        read_archive(path, path.name)


def test_decompression_limit(tmp_path, monkeypatch):
    path = zip_csv(tmp_path / "bomb.zip", "id,sequence\na," + "A" * 200 + "\n")
    monkeypatch.setattr(comparator, "MAX_UNCOMPRESSED_BYTES", 100)
    with pytest.raises(ValidationError, match="64 MiB"):
        read_archive(path, path.name)


def test_stream_limit():
    with io.BufferedReader(comparator.LimitedReader(io.BytesIO(b"x" * 101), 100)) as source:
        with pytest.raises(ValidationError, match="size limit"):
            source.read()


def test_reference_fixture_and_checksum():
    fixture = Path(__file__).resolve().parents[2] / "examples" / "dna-inversion"
    archive = fixture / "sample.zip"
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    assert score(archive, archive.name, fixture / "private" / "reference.csv", 12, digest) == {
        "accuracy": 1.0, "exact_match_rate": 1.0, "levenshtein_distance": 0.0,
        "levenshtein_similarity": 1.0, "rows": 12,
    }
    with pytest.raises(ValidationError, match="checksum"):
        score(archive, archive.name, fixture / "private" / "reference.csv", 12, "0" * 64)


def test_perturbed_fixture():
    fixture = Path(__file__).resolve().parents[2] / "examples" / "dna-inversion"
    archive = fixture / "perturbed.zip"
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    assert score(archive, archive.name, fixture / "private" / "reference.csv", 12, digest) == {
        "accuracy": 0.96875, "exact_match_rate": 0.0, "levenshtein_distance": 1.0,
        "levenshtein_similarity": 0.96875, "rows": 12,
    }


def test_invalid_reference_is_operational_failure(tmp_path):
    archive = zip_csv(tmp_path / "upload.zip")
    reference = tmp_path / "reference.csv"
    reference.write_text("id,wrong\na,A\n", encoding="utf-8")
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    with pytest.raises(RuntimeError, match="organizer reference"):
        score(archive, archive.name, reference, 2, digest)


def test_row_and_compressed_limits(tmp_path, monkeypatch):
    archive = zip_csv(tmp_path / "upload.zip")
    monkeypatch.setattr(comparator, "MAX_ROWS", 1)
    with pytest.raises(ValidationError, match="100,000"):
        read_archive(archive, archive.name)
    monkeypatch.setattr(comparator, "MAX_COMPRESSED_BYTES", 1)
    with pytest.raises(ValidationError, match="10 MiB"):
        read_archive(archive, archive.name)


def test_tar_stream_size_limit(tmp_path, monkeypatch):
    archive = tar_csv(tmp_path / "upload.tar.gz")
    monkeypatch.setattr(comparator, "MAX_TAR_BYTES", 100)
    with pytest.raises(ValidationError, match="size limit"):
        read_archive(archive, archive.name)



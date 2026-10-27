"""Regenerate deterministic synthetic CSV and archive fixtures."""

import csv
import gzip
import io
import random
import tarfile
import zipfile
from pathlib import Path

OUTPUT = Path(__file__).resolve().parent / "example"


def csv_bytes(rows):
    text = io.StringIO(newline="")
    writer = csv.writer(text, lineterminator="\n")
    writer.writerow(["id", "sequence"])
    writer.writerows(rows)
    return text.getvalue().encode("utf-8")


def zip_bytes(path, contents):
    with zipfile.ZipFile(path, "w") as archive:
        member = zipfile.ZipInfo("predictions.csv", date_time=(2026, 1, 1, 0, 0, 0))
        member.compress_type = zipfile.ZIP_DEFLATED
        member.external_attr = 0o100644 << 16
        archive.writestr(member, contents)


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / "private").mkdir(exist_ok=True)
    generator = random.Random(438)
    rows = [(f"example-{index:03d}", "".join(generator.choices("abcdefghijklmnopqrstuvwxyz0123456789", k=32))) for index in range(1, 13)]
    perfect = csv_bytes(rows)
    substituted = csv_bytes([(identifier, ("z" if sequence[0] != "z" else "a") + sequence[1:]) for identifier, sequence in rows])
    (OUTPUT / "private" / "reference.csv").write_bytes(perfect)
    (OUTPUT / "sample.csv").write_bytes(perfect)
    (OUTPUT / "perturbed.csv").write_bytes(substituted)
    zip_bytes(OUTPUT / "sample.zip", perfect)
    zip_bytes(OUTPUT / "perturbed.zip", substituted)
    with (OUTPUT / "sample.tar.gz").open("wb") as destination:
        with gzip.GzipFile(filename="", fileobj=destination, mode="wb", mtime=0) as compressed:
            with tarfile.open(fileobj=compressed, mode="w") as archive:
                member = tarfile.TarInfo("predictions.csv")
                member.size = len(perfect)
                member.mode = 0o644
                archive.addfile(member, io.BytesIO(perfect))


if __name__ == "__main__":
    main()

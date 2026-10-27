# Data & submission format

The demo contains 12 synthetic records of 32 nucleotides. The three model tracks use the same records so that you can exercise the complete upload and evaluation workflow locally.

## Download examples

- [ZIP example submission](/api/challenges/dna-inversion/examples/sample.zip)
- [TAR.GZ example submission](/api/challenges/dna-inversion/examples/sample.tar.gz)
- [CSV example submission](/api/challenges/dna-inversion/examples/sample.csv)

## File format

Upload a `.zip`, `.tar.gz`, `.tgz`, `.tar.bz2`, or `.tar.xz` file containing exactly one regular CSV file. The first row must be `id,sequence`. Each subsequent row contains the record ID and your reconstructed string.

```csv
id,sequence
seq-001,ACGTACGTACGTACGTACGTACGTACGTACGT
```

IDs must match the reference dataset exactly, without duplicates, missing records, or unknown records. Row order does not matter. Values are compared exactly, including case; strings are never silently changed.

## Upload limits

The compressed upload limit is 10 MiB. Expanded CSV content is limited to 64 MiB, with a maximum of 100,000 records and 512 characters per string. Unsafe archive paths, links, encrypted entries, and extra files are rejected.

These are scaffold defaults. Operators can set a smaller compressed upload limit per challenge and adapt the comparator limits for their datasets.

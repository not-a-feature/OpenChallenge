# Synthetic text example

Twelve deterministic synthetic strings, each 32 characters long, exercise uploads, validation, scoring, and the leaderboard.

- `sample.csv`, `sample.zip`, `sample.tar.gz`: identical to the demo reference;
  accuracy 1, exact match rate 1, mean edit distance 0, normalized similarity 1.
- `perturbed.csv`, `perturbed.zip`: one substitution in every sequence;
  accuracy 0.96875, exact match rate 0, mean edit distance 1, normalized similarity 0.96875.
- `private/reference.csv`: the demo worker reference; mount into the worker only.

All three example tracks share this fixture. The demonstration reference is deliberately public. Store real event references outside the repository.

Regenerate: `uv run --project worker python examples/generate_examples.py` (repository root).
Real event: replace references → bump dataset version/row count → publish participant inputs.

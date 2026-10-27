# Synthetic DNA inversion example

12 × 32 bp deterministic fixtures. Exercise uploads → validation → scoring → leaderboard.
Synthetic; no paper datasets, model embeddings, or reproduced benchmark scores.

- `sample.csv`, `sample.zip`, `sample.tar.gz`: identical to the demo reference;
  accuracy 1, exact match rate 1, mean edit distance 0, normalized similarity 1.
- `perturbed.csv`, `perturbed.zip`: one substitution in every sequence;
  accuracy 0.96875, exact match rate 0, mean edit distance 1, normalized similarity 0.96875.
- `private/reference.csv`: the demo worker reference; mount into the worker only.

All illustrative tracks share this fixture. Model labels indicate future task slots.

Regenerate: `uv run --project worker python examples/generate_examples.py` (repository root).
Real event: replace references → bump dataset version/row count → publish participant inputs.

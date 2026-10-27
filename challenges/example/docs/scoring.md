# Evaluation & metrics

The comparator joins predictions to reference strings by ID. Values are arbitrary text and are compared exactly, including case.

## Accuracy

For each record, count identical characters at the same position and divide by the longer string length. Extra or missing characters count as mismatches. The reported accuracy is the mean over records.

## Levenshtein distance

The minimum number of single-character insertions, deletions, and substitutions needed to transform the prediction into the reference. The reported distance is the mean over records; lower is better.

## Levenshtein similarity

For each record: `1 - distance / max(reference length, prediction length)`. The reported similarity is the mean over records; higher is better. This is the primary leaderboard metric, followed by accuracy as a tiebreaker. Both-empty strings have accuracy and similarity of 1.

## Exact match rate

The fraction of records whose predicted string equals the reference exactly.

These metrics belong to the example task. A different prediction task requires an appropriate evaluator and published metric definitions.

## Overall leaderboard

The default leaderboard merges the selected primary metric across tracks:

`overall = sum(track weight × track score) / sum(track weights)`

Track weights default to 1. A weight of 0 excludes a track from the overall ranking. Scores are normalized metrics (0–1); raw edit distances are not combined. For example, scores of 80% and 60% with weights 2 and 1 give an overall score of 73.33%.

A team ranks overall only after completing every included track with a valid result. Partial teams appear without an overall score or rank. Equal overall scores share rank. Per-track rankings remain available.

Public rankings use each team's best completed result per track. Frozen rankings retain the existing completion cutoff. Final rankings use the latest accepted submission per track before the cutoff; an invalid final selection makes the team incomplete overall. Weights are published with the leaderboard and configured by organizers in `challenge.json`.

## Reproducibility

Each evaluation records the upload SHA-256, dataset version, evaluator version, and attempt. Validation failures are reported separately from worker failures. Interrupted evaluations require an organizer to retry them.

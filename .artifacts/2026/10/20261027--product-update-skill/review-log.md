# Review log: product-update Claude skill

Skill: `.claude/skills/product-update/SKILL.md`.

Three independent read-only reviewers covered GitHub evidence, cofounder QA, and
repository/Claude skill conventions. Findings below were checked against the
skill and fixed before the next round.

## Round 1

| Finding                                                                                                                | Lens              | Severity     | Resolution                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| YAML parser rejected the unquoted `argument-hint` value.                                                               | Format validation | Blocking     | Quoted the value. The bundled Codex validator later rejected Claude-only metadata, so validation used YAML parsing and Claude's official skill documentation instead of changing the format. |
| Issue/PR discovery did not specify updated-item queries; commit and deploy discovery lacked a reproducible date bound. | GitHub evidence   | Important    | Added `--state all` candidate searches, exact timestamp filtering, bounded commit queries, workflow run and deployment evidence, and pagination.                                             |
| `NO ENVIAR TODAVÍA` could suppress an otherwise ready update when only one of several QA flows was unavailable.        | Cofounder QA      | Important    | Restricted the label to cases where no useful part is ready or the main purpose depends on the unavailable flow. Keep other unreleased work separate.                                        |
| Range/baseline wording exceeded the argument hint.                                                                     | GitHub evidence   | Non-blocking | Scoped the supported arguments to a date and `qa`, `progreso`, or `ambos`.                                                                                                                   |

## Round 2

| Finding                                                                                               | Lens                | Severity  | Resolution                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------- | ------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local diffs could be incorrectly attributed to the current day without reliable change timestamps.    | GitHub evidence     | Important | Require a commit, dated artifact, or reliable timestamped activity; otherwise label as ongoing with unknown start date or omit from the day's activity. |
| GitHub date search using Lima dates could miss activity in the UTC calendar day after the local date. | GitHub evidence     | Important | Derive exact UTC boundaries, search across overlapping UTC dates plus a neighboring date, and filter each event by its timestamp.                       |
| `qa`, `progreso`, and `ambos` had no defined output differences.                                      | Repository/format   | Important | Defined each mode explicitly.                                                                                                                           |
| Repeated same-minute report runs could still collide on the artifact path.                            | Repository/artifact | Important | Retry with the next available minute or incrementing numeric suffix.                                                                                    |

## Round 3

| Finding                                                                                                  | Lens            | Severity     | Resolution                                                                                                   |
| -------------------------------------------------------------------------------------------------------- | --------------- | ------------ | ------------------------------------------------------------------------------------------------------------ |
| A run started before the reporting window but completed or deployed within it could be missed.           | GitHub evidence | Important    | Search relevant deployment runs broadly and check completion/deployment timestamps, not creation time alone. |
| The `progreso` instruction conflicted with the general rule requiring a QA CTA in every sendable update. | Cofounder QA    | Important    | Limit QA CTA behavior to `qa` and `ambos`; `progreso` is progress-only.                                      |
| `since`-only issue API candidate discovery could include later-updated issues for a past report date.    | GitHub evidence | Non-blocking | Use a bounded UTC date candidate search, then inspect exact event timestamps.                                |

## Round 4

All three independent reviewers found no remaining issues in their assigned
lenses: GitHub evidence, cofounder QA, and Claude/repository conventions.

## Round 5

Final fresh-eyes verification following the clean fourth round. All three
independent reviewers confirmed no remaining issues in GitHub evidence,
cofounder QA, and Claude/repository conventions. Rounds four and five were
consecutive clean rounds.

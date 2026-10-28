# Implementation log: product-update Claude skill

## Added

- `.claude/skills/product-update/SKILL.md`: project-level Claude skill based on the supplied `product-update` text and tailored to Bias Market.
- `plan.md`: scope and acceptance criteria.
- `review-log.md`: independent review findings and resolutions.

## Behavior captured in the skill

- Daily reporting in `America/Lima` (UTC−5), with exact UTC event boundaries.
- GitHub CLI as the primary evidence source for issues, PRs, comments, reviews, commits, workflow runs, and deployment records.
- Honest distinction between in-progress, open PR, merged, deployed, available for QA, and partial delivery with follow-up issues.
- Selective nontechnical QA requests with a direct CTA; technical fixes stay in a separate progress note.
- Plain Spanish without em dashes.
- A unique dated `.artifacts` report for every run, with evidence and two review passes.

## Validation

- YAML frontmatter parsed successfully with PyYAML.
- `git show --check` passed for the skill and dated work artifacts in `HEAD`; a whitespace scan found no trailing whitespace or em dashes.
- The bundled `quick_validate.py` is a Codex skill validator and does not accept Claude Code fields such as `disable-model-invocation` or `argument-hint`; it was not used as the format authority. Claude Code's official Skills documentation was checked for the project skill path, frontmatter, invocation control, and argument support.
- Independent review rounds: three specialist lenses in five rounds. The last two rounds were clean.

# Review rounds: PR #576

## Round 0: context

CodeRabbit inline threads (39) and review bodies read; `known-issues.md` built
from them so hunters did not re-report. State: PR already merged.

## Round B (gap hunt, fresh eyes, five parallel agents)

Areas: API/data/migrations; mobile app; CI/release/docs/web; test quality with
mutation testing; ledger of bot findings still open at head. Outcome: 23 inline
comments drafted, 2 thread replies, ~6 review-body items carried over from
CodeRabbit's collapsed sections. Claims I re-verified myself before drafting:
session refresh handler is never called at head; five validation keys missing
from `en/mobile.json`; AGENCY branch omits department/province/district while
the shared schema requires them; `expo-updates` absent from `package.json`;
`Customer` model holds phone/email/name and `identityErasedAt`; `OrderPayment`
has no `imageUrl` index; `mobile-release` branch 404 and environments list.

## Round A/D/E combined (adversarial + author's advocate + payload gate)

Pending at time of writing; results below.

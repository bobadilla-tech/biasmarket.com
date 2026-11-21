# Order payment operation code NFKC backfill

This is a one-time, data-only operation for legacy `OrderPayment.operationCode`
values. It is not a Prisma migration. The API now stores operation codes in NFKC
form and compares them per store after removing non-ASCII alphanumerics and
uppercasing; this backfill makes older rows follow the same comparison path.

Before running it, rehearse against a recent restored database copy and review
the collision and empty-key reports. The script requires PostgreSQL 13+ with
UTF8 server encoding. Run it through `psql` with `ON_ERROR_STOP` enabled:

```sh
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f packages/db/operations/order-payment-operation-code-nfkc-backfill.sql
```

The transaction takes a `SHARE ROW EXCLUSIVE` lock on `OrderPayment` while it
preflights and updates, so schedule it when a brief pause to payment writes is
acceptable. The first report lists active, non-voided, non-rejected rows whose
new comparison key would newly collide across orders within a store. If any are
found, the script raises an error and rolls back without changing rows; resolve
those values with the relevant store before rerunning. The guard reports a
normalized key found on multiple orders when at least one row's old comparison
key differed from it. This also catches legacy values that previously
normalized to an empty comparison key but become nonempty under NFKC, while
leaving collisions that were already present unchanged out of the report.

The second report lists legacy values whose comparison key remains empty.
These rows do not collide: duplicate lookup skips empty incoming keys, and the
API rejects nonblank input that normalizes to an empty key. The script changes
only Unicode normalization; it does not trim, remove punctuation, or otherwise
rewrite stored values. Verification must return `rows_still_needing_nfkc = 0`.

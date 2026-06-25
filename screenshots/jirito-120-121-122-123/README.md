# JIRITO-105/120/121/122/123 visual proof

Screenshots captured by `tests/jirito-120-121-122-123.spec.mjs` to
prove the persistence + SSE fixes work end-to-end. All screenshots
are full-page Playwright captures; the test spec asserts the
expected behavior in addition to capturing the visual proof.

## Index

| File | Ticket | What it proves |
|------|--------|----------------|
| `01-prmerged-before-refresh.png` | JIRITO-120 | API PUT prMerged=true → DB stores the flag → detail panel checkbox reflects it |
| `02-prmerged-after-refresh.png` | JIRITO-120 | Same page after F5; flag persists across refresh |
| `03-comments-render.png` | JIRITO-121 | Agent comments render with author + content + valid date (no "Invalid Date") |
| `04-comments-after-refresh.png` | JIRITO-121 | Same comments survive F5 |
| `05-board-before-sse.png` | JIRITO-122 | Initial state: ticket 101 in todo column |
| `06-board-after-sse-move.png` | JIRITO-122 | After API PUT `{status:'inprogress'}`; ticket moved to inprogress WITHOUT manual refresh (SSE propagated) |
| `07-board-after-sse-create.png` | JIRITO-122 | After POST /api/issues; new ticket appeared on board in real time |
| `08-filters-set.png` | JIRITO-123 | Search query "Add card" + type filter "bug" applied |
| `09-filters-after-refresh.png` | JIRITO-123 | Same filters restored after F5 |

## Reproducing

```bash
npm test -- tests/jirito-120-121-122-123.spec.mjs
```

Tests run against the isolated test backend (port 3002, DB at
/tmp/jirito-test.db). Screenshots are written here on each run.

# Document Governance Eval

Tool: codex

Project: `EzEditorJumper-V`
Wave: `wave2`
Date: 2026-06-06

## Changes

- Added knowledge, error-memory, ADR, specs, and legacy document indexes.
- Updated `vibe/rules/knowledge.md` with the authoritative document governance map.
- Preserved historical documents; no bulk deletion was performed.

## Legacy Document Inventory

- `历史规则目录`: 2 Markdown files
- `docs/`: 1 Markdown files

## Verification

Default project audit:

```text
AI rule audit: OK
```

Deep historical Markdown scan summary using `--all-markdown`:

```text
stale=4
broken_or_nonportable=0
duplicate_headings=3
possible_sensitive=0
exit_code=1
```

## Remaining Work

- Treat deep historical Markdown scan findings as backlog unless they affect active AI rules, active specs, knowledge indexes, or DB root rules.
- Do not delete legacy documents until reusable conclusions are extracted and old/new links are recorded.

## Memory Routing

- Project memory: updated document governance map and indexes.
- Error archive: not needed.
- ADR: not needed.
- DB memory: not needed.

## Deep Hygiene Follow-up - 2026-06-06

- Active AI rule audit remains passing.
- Stale legacy rule/path patterns after cleanup: `0`.
- Deep historical Markdown backlog: broken links `0`, duplicate headings `3`, sensitive findings `0`, other portability findings `0`.
- Safe automatic relative-link repair was run after the CodeNote audit script learned root-relative fallback.
- Remaining findings are historical-document hygiene backlog unless they touch active AI rule surfaces.

## Small Project Deep Cleanup - 2026-06-06

- Disambiguated repeated CHANGELOG Added headings by release. Deep all-markdown audit is now OK.
- Remaining stale paths: `0`; broken links: `0`; duplicate headings: `0`; sensitive findings: `0`; other findings: `0`.

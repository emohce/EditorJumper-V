# Legacy Document Map

Tool: codex

This file maps historical document locations after the CodeNote master-rule migration. It does not delete old documents.

| Legacy path | Markdown count | Current handling |
| --- | ---: | --- |
| `历史规则目录` | 2 | Historical source; extract current facts into `vibe/rules/`, `vibe/knowledge/`, `vibe/specs/`, or `vibe/ai-db/` as appropriate |
| `docs/` | 1 | Historical source; extract current facts into `vibe/rules/`, `vibe/knowledge/`, `vibe/specs/`, or `vibe/ai-db/` as appropriate |
| `260202-tool-editorjumper-vscode-to-jetbrains-ide-jump-flow.md` (root, 2026-06) | 1 | Moved to [260202-tool-editorjumper-vscode-to-jetbrains-ide-jump-flow.md](260202-tool-editorjumper-vscode-to-jetbrains-ide-jump-flow.md); pre–cache-globalization flow inventory, may be stale |
| `yy260202-cursor-vscode-local-vsix.md` (root, 2026-06) | 1 | Moved to [../../docs/yy260202-cursor-vscode-local-vsix.md](../../docs/yy260202-cursor-vscode-local-vsix.md) |
| `_fix.js` / `_fix.ps1` / `_fix.py` / `_fix2.py` / `_fix_template*.js` | 6 | Removed; one-off AI patch scripts, not part of the extension |

## Sample Files

### `历史规则目录`
- `legacy master rule.md` (legacy rule file)
- `VibeAi_Task_Eval_Template.md` (legacy rule file)
### `docs/`
- `docs/core-commands.md`

## Cleanup Rule

Before removing or rewriting old documents, preserve reusable conclusions in the current authoritative location and add links between old and new docs.

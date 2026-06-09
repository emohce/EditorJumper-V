# Change Log

## [1.0.0]
### Added
- Initial release of EditorJumper.
- Seamless switching between VS Code, Cursor, Trae, Windsurf, and JetBrains IDEs.
- Maintains cursor position and editing context.
- Multiple trigger methods including right-click menu and status bar.
- Easy target IDE selection.


## [1.0.4] - 2025-03-18
### Added
- Added Q&A section in README for troubleshooting Mac issues.
- Improved error handling for Mac users.

## [1.1.0] - 2025-03-21
### Added
- Added support for Xcode on macOS.

## [1.1.1] - 2025-04-03
### Changed
- Changed `selectedIDE` configuration to be project-level (resource scope).

## [2.0.4] - 2026-06-09
### Fixed
- Register all commands before async init so Windsurf/Devin can resolve `editorjumper.openSlot*`.
- Remove explicit `activationEvents`; VS Code infers command activation from `contributes`.
- Declare `editorjumper.pickSlotToJump` in package.json.

## [2.0.3] - 2026-06-09
### Added
- EzEditorJumper-V branding; default JetBrains IDE backfill from shared cache.
- Bottom slot picker panel with configure entry; root project path supports files with blocklist validation.

### Changed
- Status bar opens slot menu above status bar (Panel webview) instead of top QuickPick.
- Empty JetBrains root path resolves to current workspace folder or first `.code-workspace` folder.

### Removed
- Root-level `_fix*` scratch scripts, duplicate `.iml`, and IDE user settings from repo.

## [2.0.2]
### Changed
- Cache-global configuration migration (shared-apps.json, project cache).

## [1.2.0] - 2025-09-30
### Added
- Added fast mode command support with Shift+Alt+P keyboard shortcut on macOS.



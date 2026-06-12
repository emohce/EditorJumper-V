# EzEditorJumper-V Technical Details

Tool: codex
Date: 2026-06-12

## Sync Rule

Update this file when a maintained module's entrypoint, storage/data contract, integration boundary, key workflow, or verification command changes. Keep entries as module + technology + code address.

## Module Index

| Module | Technology / Mechanism | Code Address | Current Notes | Last Verified |
| --- | --- | --- | --- | --- |
| VS Code extension entry | JavaScript VS Code API | [../../src/extension.js](../../src/extension.js:1), [../../package.json](../../package.json:1) | Extension activation and command registration entry. | 2026-06-12 |
| Configuration UI | JavaScript webview/config panel | [../../src/configPanel.js](../../src/configPanel.js:1), [../../src/slotPickerView.js](../../src/slotPickerView.js:1) | User-facing configuration and slot selection UI. | 2026-06-12 |
| Config storage | JavaScript global/project stores | [../../src/globalConfigStore.js](../../src/globalConfigStore.js:1), [../../src/projectConfigStore.js](../../src/projectConfigStore.js:1), [../../src/legacyConfigMigration.js](../../src/legacyConfigMigration.js:1) | Global/project settings and legacy migration. | 2026-06-12 |
| Workspace routing | JavaScript path/workspace utilities | [../../src/workspaceRouteUtil.js](../../src/workspaceRouteUtil.js:1), [../../src/codeWorkspaceUtil.js](../../src/codeWorkspaceUtil.js:1), [../../src/rootProjectPathUtil.js](../../src/rootProjectPathUtil.js:1) | Resolves target project/workspace paths for editor jumps. | 2026-06-12 |
| Verification | Node test suite | [../../test/extension.test.js](../../test/extension.test.js:1), [../../test/workspaceRouteUtil.test.js](../../test/workspaceRouteUtil.test.js:1) | Unit coverage for extension utilities and route behavior. | 2026-06-12 |

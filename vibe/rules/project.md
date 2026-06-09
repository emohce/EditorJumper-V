# Project Rules

Tool: codex

## Project Profile

- Name: `EzEditorJumper-V`
- Current inferred stack: Vue/Node editor jumper utility
- Migration date: 2026-06-06

## Detected Manifests

- `package.json`

## Local Rule Policy

- Keep project-specific constraints here; move reusable cross-project rules to CodeNote.
- Do not overwrite existing user work or unrelated business files.
- Before implementation, inspect the relevant source paths and existing docs for the current task.
- For UI work, follow project style first, then CodeNote UI rules.
- For security, data, release, or permission work, apply CodeNote high-risk gates.

## High-Risk Areas

- Treat configuration, credentials, release scripts, generated artifacts, data mutations, and external-service writes as high risk until project-specific rules say otherwise.
- Add concrete high-risk paths here as they are discovered.
## Migrated Project-Specific Constraints

- 修改 command 或 activation event 前必须确认触发入口、命令注册和扩展宿主回归路径。
- 修改 editor selection / jump 行为前必须确认焦点上下文和目标解析规则。
- 构建产物和 IDE 生成文件不手改。

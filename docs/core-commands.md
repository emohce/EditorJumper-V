# EditorJumper 核心命令和参数文档

本文档详细说明了 EditorJumper 插件用于在不同编辑器之间跳转的核心命令行参数。

## 概述

EditorJumper 通过生成并执行命令行命令来实现从 JetBrains IDE 跳转到外部编辑器（Cursor、Windsurf、VSCode 等）。命令生成逻辑封装在 `EditorHandler` 接口中，根据不同的操作系统和场景生成对应的命令。

## 命令类型

### 1. 标准打开命令 (`getOpenCommand`)

标准命令使用编辑器的命令行工具，通过 `--goto` 参数指定文件位置。

#### Windows 平台

**默认路径（使用系统 PATH）：**
```bash
cmd /c Cursor "projectPath" --goto "filePath:line:column"
```

**自定义路径：**
```bash
cmd /c "C:\Users\username\AppData\Local\Programs\Cursor\Cursor.exe" "projectPath" --goto "filePath:line:column"
```

**无文件时（仅打开项目）：**
```bash
cmd /c Cursor "projectPath"
```

#### macOS 平台

**有文件时：**
```bash
/Applications/Cursor.app/Contents/Resources/app/bin/code "projectPath" --goto "filePath:line:column"
```

**无文件时：**
```bash
open -a Cursor "projectPath"
```

#### Linux 平台

```bash
Cursor "projectPath" --goto "filePath:line:column"
```

### 2. 快速打开命令 (`getFastOpenCommand`)

快速命令使用 macOS 的 URL scheme，仅在 Mac 平台可用，速度更快。

#### 有文件时

```bash
open -a Cursor "cursor://file/path/to/file:line:column"
```

#### 无文件时

```bash
open -a Cursor "projectPath"
```

## 各编辑器的具体命令

### Cursor

**配置（editors.json）：**
```json
{
  "name": "Cursor",
  "macPath": "/Applications/Cursor.app/Contents/Resources/app/bin/code",
  "winPath": "Cursor",
  "linuxPath": "Cursor",
  "macOpenName": "cursor",
  "supportsWorkspace": true
}
```

**Windows 命令：**
```bash
# 有文件
cmd /c Cursor "projectPath" --goto "filePath:line:column"

# 无文件
cmd /c Cursor "projectPath"
```

**macOS 标准命令：**
```bash
# 有文件
/Applications/Cursor.app/Contents/Resources/app/bin/code "projectPath" --goto "filePath:line:column"

# 无文件
open -a Cursor "projectPath"
```

**macOS 快速命令：**
```bash
# 有文件
open -a Cursor "cursor://file/path/to/file:line:column"

# 无文件
open -a Cursor "projectPath"
```

**Linux 命令：**
```bash
Cursor "projectPath" --goto "filePath:line:column"
```

### Windsurf

**配置（editors.json）：**
```json
{
  "name": "Windsurf",
  "macPath": "/Applications/Windsurf.app/Contents/Resources/app/bin/windsurf",
  "winPath": "Windsurf",
  "linuxPath": "Windsurf",
  "macOpenName": "windsurf",
  "supportsWorkspace": true
}
```

**Windows 命令：**
```bash
# 有文件
cmd /c Windsurf "projectPath" --goto "filePath:line:column"

# 无文件
cmd /c Windsurf "projectPath"
```

**macOS 标准命令：**
```bash
# 有文件
/Applications/Windsurf.app/Contents/Resources/app/bin/windsurf "projectPath" --goto "filePath:line:column"

# 无文件
open -a Windsurf "projectPath"
```

**macOS 快速命令：**
```bash
# 有文件
open -a Windsurf "windsurf://file/path/to/file:line:column"

# 无文件
open -a Windsurf "projectPath"
```

**Linux 命令：**
```bash
Windsurf "projectPath" --goto "filePath:line:column"
```

### Visual Studio Code

**配置（editors.json）：**
```json
{
  "name": "Visual Studio Code",
  "macPath": "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
  "winPath": "Code",
  "linuxPath": "Code",
  "macOpenName": "vscode",
  "supportsWorkspace": true
}
```

**Windows 命令：**
```bash
# 有文件
cmd /c Code "projectPath" --goto "filePath:line:column"

# 无文件
cmd /c Code "projectPath"
```

**macOS 标准命令：**
```bash
# 有文件
/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code "projectPath" --goto "filePath:line:column"

# 无文件
open -a "Visual Studio Code" "projectPath"
```

**macOS 快速命令：**
```bash
# 有文件
open -a "Visual Studio Code" "vscode://file/path/to/file:line:column"

# 无文件
open -a "Visual Studio Code" "projectPath"
```

**Linux 命令：**
```bash
Code "projectPath" --goto "filePath:line:column"
```

## 参数说明

### `--goto` 参数

格式：`--goto "filePath:line:column"`

- `filePath`: 文件的绝对路径
- `line`: 目标行号（从 1 开始）
- `column`: 目标列号（从 1 开始）

**示例：**
```bash
--goto "/Users/user/project/src/main.kt:10:5"
```

### URL Scheme 参数

格式：`{scheme}://file{filePath}:{line}:{column}`

- `scheme`: 编辑器的 URL scheme 名称（cursor、windsurf、vscode 等）
- `filePath`: 文件的绝对路径
- `line`: 目标行号（从 1 开始）
- `column`: 目标列号（从 1 开始）

**示例：**
```bash
cursor://file/Users/user/project/src/main.kt:10:5
```

### 路径引号处理

某些编辑器需要对路径加引号以防止空格被分词。通过 `quotePaths` 配置控制。

**需要引号的编辑器：**
- Cursor（Windows）

**不需要引号的编辑器：**
- VSCode、Windsurf 等

## Workspace 支持

如果编辑器配置了 `supportsWorkspace: true`，且项目配置了 workspace 文件路径（.code-workspace），则优先使用 workspace 文件打开项目。

**配置示例：**
```json
{
  "supportsWorkspace": true
}
```

**优先级：**
1. 配置的 workspace 文件路径（如果存在）
2. 项目根路径

## 命令执行方式

所有命令通过 `ProcessBuilder` 异步执行，输出被丢弃以避免阻塞。

```kotlin
ProcessBuilder(command.toList())
    .redirectOutput(ProcessBuilder.Redirect.DISCARD)
    .redirectError(ProcessBuilder.Redirect.DISCARD)
    .start()
    .outputStream.close()
```

## 快捷键触发

| 快捷键 | 命令类型 | 平台 |
|--------|---------|------|
| Alt+Shift+O / Option+Shift+O | 标准命令 | 全平台 |
| Alt+Shift+P / Option+Shift+P | 快速命令（Mac）/ 标准命令（Win） | Mac/Win |

## 添加新编辑器

要在插件中添加新编辑器，只需在 `editors.json` 中添加配置，无需修改 Kotlin 代码。

**配置模板：**
```json
{
  "name": "Editor Name",
  "macPath": "/Applications/Editor.app/Contents/Resources/app/bin/editor",
  "winPath": "Editor",
  "linuxPath": "editor",
  "macOpenName": "editor",
  "supportsWorkspace": true,
  "quotePaths": false
}
```

## 注意事项

1. **行号和列号从 1 开始**：编辑器通常使用 1-based 索引
2. **路径引号**：确保包含空格的路径被正确处理
3. **Windows 路径**：使用反斜杠，但在命令行中可能需要转义
4. **macOS URL scheme**：仅支持已注册 URL scheme 的编辑器
5. **Workspace 文件**：必须存在且可访问才会被使用

## 相关文件

- `editors.json`: 编辑器配置文件
- `EditorHandler.kt`: 命令生成逻辑
- `BaseAction.kt`: 命令执行逻辑
- `OpenInExternalEditorAction.kt`: 标准打开动作
- `FastOpenInExternalEditorAction.kt`: 快速打开动作

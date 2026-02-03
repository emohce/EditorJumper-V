# 260202-tool-EditorJumper-V：VS Code to JetBrains IDE Jump Flow

## Main Flows at a Glance

| Flow | Trigger | Path | Outcome |
|------|--------|------|---------|
| **Activation** | VS Code `onStartupFinished` | `src/extension.js` → `activate()` | Load config, ensure `selectedIDE`/Xcode, create status bar, register commands, subscribe to config changes. |
| **Select IDE** | Status bar click / QuickPick | `editorjumper.selectJetBrainsIDE` | Show IDE list (+ Configure); on choice → update `selectedIDE` and refresh status bar. |
| **Jump (standard)** | Shift+Alt+O / context menu "Open in JetBrains IDE" | `editorjumper.openInJetBrains` → `openInJetBrainsInternal(uri, false)` | Resolve IDE, file/line/column, project path, command path → `executeCommand` → **standard mode** (CLI with `--line`/`--column`) or **Xcode** branch. |
| **Jump (fast, macOS)** | Shift+Alt+P | `editorjumper.openInJetBrainsFast` → `openInJetBrainsInternal(uri, true)` | Same resolve; if darwin + IDE `supportsFastMode` → **fast mode** (`open -a` + URL scheme for file/line/column). |
| **Configure** | "Configure EditorJumper" in QuickPick or command | `editorjumper.configureIDE` → `configPanel.createConfigurationPanel()` | Open Webview; handle add/update/remove/select IDE, selectPath; persist to `editorjumper.ideConfigurations` / `selectedIDE`, refresh status bar. |

**Key files:** `src/extension.js` (entry, jump & execute logic), `src/configPanel.js` (Webview + message handlers), `src/defaultIDEPaths.js` (default CLI paths + `ideConfigs` for URL scheme / mac app names / fast mode).

---

## 范围声明
本文仅用于梳理 **EditorJumper-V** 扩展中，从 VS Code（及兼容编辑器）跳转打开 JetBrains IDE（以及 Xcode）的现有功能与逻辑关系。

不包含：
- 新需求设计
- 代码重构建议
- UI/交互优化方案
- 测试用例新增

## 目标
- 覆盖「扩展激活 → IDE 选择 → 标准跳转 → macOS 快速模式跳转 → 配置面板读写配置」的主链路
- 明确分支条件（平台/IDE 支持/是否传入 uri 等）
- 给出关键代码跳转链接（相对路径+行号范围）

## 功能边界
- **负责**
  - 在 VS Code 中：
    - 维护状态栏入口用于 IDE 选择
    - 读取/更新用户配置：`editorjumper.selectedIDE`、`editorjumper.ideConfigurations`
    - 将当前文件路径及光标行列转换成 JetBrains CLI 参数
    - 按平台策略执行命令：Windows `cmd /c`、macOS `open -a`（快速模式）、常规直接执行
  - 在配置 Webview 中：
    - 展示/编辑 IDE 列表（新增、更新、删除、隐藏、选择）
    - 将配置写回 VS Code Settings，并通知状态栏刷新

- **不负责**
  - 校验 IDE CLI 本身是否可用、是否能正确解析 `--line/--column`
  - JetBrains Toolbox / 各 IDE 的安装与命令行工具创建
  - 工作区根目录的复杂推断（仅基于 VS Code workspace folder）

## 主流程
### 1) 扩展激活与初始化
1. VS Code 触发 `activate(context)`
2. 加载配置与配置面板模块（避免循环引用）
3. 校验 `selectedIDE` 是否存在于 `ideConfigurations`，否则默认选择第一个
4. macOS 下确保 `ideConfigurations` 中包含 Xcode（若不存在则自动追加）
5. 创建状态栏入口并注册各命令
6. 监听配置变更，变更时刷新状态栏

### 2) 通过状态栏选择 IDE
1. 状态栏点击触发 `editorjumper.selectJetBrainsIDE`
2. 从 `ideConfigurations` 生成 QuickPick 列表（过滤 `hidden=true`）
3. 追加“Configure EditorJumper”入口
4. 用户选择：
   - configure：执行 `editorjumper.configureIDE` 打开配置面板
   - IDE：更新 `selectedIDE` 并刷新状态栏

### 3) 标准跳转（openInJetBrains）
1. 命令 `editorjumper.openInJetBrains(uri)` 调用内部逻辑 `openInJetBrainsInternal(uri, false)`
2. 解析目标 IDE 配置（按 `selectedIDE` 查找）
3. 解析文件路径与光标位置：
   - 若传入 `uri`：使用 `uri.fsPath`
   - 若未传入且有活动编辑器：使用 `activeTextEditor.document.uri.fsPath`
   - 行号：`selection.active.line + 1`
   - 列号：`selection.active.character`（注意：此处未 +1）
4. 解析项目根目录 `projectPath`：
   - **若已配置 `editorjumper.jetBrainsRootProjectPath`**（非空）：`projectPath = path.normalize(jetBrainsRootProjectPath)`，用于多模块/多工作目录场景（各工作目录已在 Jet 根项目下）。
   - **若未配置**：有 workspace folder 时默认取第一个；多 workspace folder 且有 `filePath` 时用 `getWorkspaceFolder(fileUri)` 命中包含该文件的 folder；无 workspace folder 时报错并退出。
5. 解析 `commandPath`：
   - 优先 `ideConfig.commandPath`
   - 否则取 `defaultIDEPaths[ideConfig.name]?.[platform]`
   - 若仍为空：提示用户是否打开配置面板，并高亮对应 IDE
6. 进入 `executeCommand(...)` 统一分发执行

### 4) macOS 快速模式跳转（openInJetBrainsFast）
1. 命令 `editorjumper.openInJetBrainsFast(uri)` 调用 `openInJetBrainsInternal(uri, true)`
2. 在 `executeCommand(...)` 内判断是否可用快速模式：
   - `fastMode=true`
   - `platform === 'darwin'`
   - IDE 配置 `supportsFastMode=true`
3. 满足条件时调用 `executeFastMode(...)`：
   - 无 `filePath`：`open -a "{macAppName}" "{projectPath}"`
   - 有 `filePath`：拼 URL scheme `scheme://open?file=...&line=...&column=...`，再 `open -a "{macAppName}" "{url}"`

### 5) 配置面板（Webview）与配置保存
1. `editorjumper.configureIDE` 调用 `configPanel.createConfigurationPanel(context)`
2. Webview 初次渲染：`getWebviewContent(config.get('ideConfigurations'))`
3. Webview 通过 `postMessage` 发回指令，扩展侧 `onDidReceiveMessage` 处理：
   - `addIDE`：新增或按 name 覆盖更新（合并/规范化 `isCustom`、`hidden`），写入 settings
   - `updateIDE`：更新指定 IDE，并在“隐藏当前选中 IDE”时自动切换到第一个可见 IDE
   - `removeIDE`：不允许删除当前选中 IDE
   - `selectIDE`：更新 `selectedIDE`
   - `selectPath`：弹出文件选择对话框，将结果回传到 Webview
   - `selectPathForRootProject`：弹出目录选择对话框，将选中路径写入 `editorjumper.jetBrainsRootProjectPath` 并刷新 Webview
   - `saveRootProjectPath`：将 Webview 中“JetBrains 根项目路径”输入框的值写入 `editorjumper.jetBrainsRootProjectPath` 并刷新 Webview
4. 每次配置变更后：重渲染 Webview，并执行 `editorjumper.updateStatusBar`

## 关键分支
- **`selectedIDE` 不存在/失效** → 激活时默认选第一个 IDE
- **macOS + Xcode 配置缺失** → 激活时自动插入 Xcode 到 `ideConfigurations`
- **IDE 被隐藏**
  - 选择 IDE QuickPick 列表中被过滤
  - Webview 中切换 hidden 时，若隐藏的是当前 `selectedIDE` → 自动切换到第一个未隐藏 IDE
- **无 workspace folder** 且未配置 `jetBrainsRootProjectPath` → 标准跳转直接报错并退出
- **`editorjumper.jetBrainsRootProjectPath` 已配置且非空** → 跳转时 `projectPath` 使用该路径（`path.normalize` 后），不依赖 workspace folder；适用于多模块/多工作目录（各目录已在 Jet 根项目下）
- **`commandPath` 为空** → 弹框引导打开配置面板，并高亮 IDE
- **快速模式开关**
  - 仅 macOS 且 IDE `supportsFastMode=true` 时使用 URL scheme + `open -a`
  - 否则降级到标准模式
- **Xcode 特殊处理（macOS）**
  - 不走 JetBrains CLI 参数
  - `open -a "Xcode" projectPath` 后（可能延迟）用 `xed -l lineNumber filePath` 打开文件

## 可选：JetBrains 根项目路径
- **配置键**：`editorjumper.jetBrainsRootProjectPath`（string，默认空）
- **用途**：多模块或多工作目录场景下，VS Code 内各工作目录已位于同一 JetBrains 根项目（含 `.idea` 的目录）下时，可指定该根项目路径；跳转时统一以此路径作为 `projectPath` 传给 IDE，从而在 JetBrains 内打开同一项目并定位到对应文件。
- **解析优先级**：若已配置且非空，则 `projectPath = path.normalize(jetBrainsRootProjectPath)`；否则按原逻辑使用 workspace folder。
- **配置入口**：EditorJumper 配置面板顶部“JetBrains 根项目路径（可选）”输入框 + “浏览目录”/“Save”；也可在 VS Code 设置或工作区 JSON 中直接编辑。

## 数据流（输入 / 状态 / 输出）
- **输入**
  - VS Code 命令入参：`uri`（可选）
  - 编辑器状态：`window.activeTextEditor`（可选）
  - 工作区状态：`workspace.workspaceFolders`
  - 用户配置：`editorjumper.selectedIDE`、`editorjumper.ideConfigurations`、`editorjumper.jetBrainsRootProjectPath`（可选，JetBrains 根项目目录）

- **状态**
  - `selectedIDE`（当前选中 IDE 名称）
  - `ideConfigurations[]`（IDE 列表，含 `name`/`commandPath`/`isCustom`/`hidden`）
  - `jetBrainsRootProjectPath`（可选；配置后跳转时统一使用该路径作为 `projectPath`，否则使用 workspace folder）

- **输出**
  - 进程启动：通过 `child_process.exec()` 执行命令
  - UI：状态栏文本/tooltip 更新；QuickPick；Webview 渲染；信息/错误提示

## 依赖与影响
- **外部依赖**
  - VS Code Extension API
  - OS 命令/能力：
    - Windows: `cmd /c`
    - macOS: `open -a`、（Xcode）`xed`、`ps aux`
    - JetBrains URL scheme（快速模式）
  - Node.js：`child_process.exec/execSync`、`fs`、`path`、`os`

- **影响范围**
  - 修改 `ideConfigurations` / `selectedIDE` 会影响：
    - 状态栏显示
    - QuickPick 可选项
    - 实际执行的 `commandPath`/URL scheme

## 限制与注意
- `columnNumber` 来源为 `selection.active.character`，当前实现未显式转换为 1-based；其是否符合目标 IDE 的期望取决于 IDE CLI/URL scheme 的定义。
- `projectPath` 获取策略：若配置了 `jetBrainsRootProjectPath` 则优先使用；否则以 workspace folder 为准。未对 `*.code-workspace` 或多根目录复杂场景做更多推断。
- `executeFastMode` 依赖 IDE 的 URL scheme，若 IDE 未注册 scheme 或被系统拦截，将导致打开失败。

## 代码关联（必须可跳转，仅允许相对路径+行号范围）
- [code](./src/extension.js#L78-L125) `activate`：加载配置、初始化 selectedIDE、创建状态栏
- [code](./src/extension.js#L126-L172) 命令注册：选择 IDE / 标准跳转 / 快速跳转
- [code](./src/extension.js#L241-L329) `openInJetBrainsInternal`：解析 IDE、filePath、line/column、projectPath、commandPath
- [code](./src/extension.js#L334-L360) `executeCommand`：统一分发（快速模式 / Xcode / 标准模式）
- [code](./src/extension.js#L365-L399) `executeFastMode`：macOS URL scheme + `open -a`
- [code](./src/extension.js#L404-L416) `executeStandardMode`：构建 `--line/--column` 参数
- [code](./src/extension.js#L454-L468) `executeRegularIDECommand`：最终 `exec(fullCommand)`
- [code](./src/extension.js#L514-L527) `updateStatusBar`：状态栏文案/tooltip
- [code](./src/extension.js#L487-L501) 配置命令与状态栏刷新命令注册
- [code](./src/extension.js#L503-L512) 配置变更监听与状态栏初次 show
- [code](./src/configPanel.js#L14-L211) `createConfigurationPanel`：创建 webview + 消息处理（add/update/remove/select/selectPath/selectPathForRootProject/saveRootProjectPath）
- [code](./src/configPanel.js#L198-L614) `getWebviewContent`：渲染配置 UI + 前端 JS `postMessage`
- [code](./src/configPanel.js#L620-L627) `highlightIDE`：配置缺失时高亮并滚动到指定 IDE

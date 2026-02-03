# VSCode 扩展本地打包（pnpm + VSIX）

## 适用范围

- 本文用于将当前仓库打包为 VSCode 可本地安装的 `.vsix` 文件
- 适用于 Windows / macOS / Linux
- 不包含发布到 VSCode Marketplace 的流程（需要 publisher / token / 签名等）

## 前置条件

- 已安装 Node.js（建议 LTS）
- 已安装 pnpm
- 在仓库根目录（存在 `package.json`）执行命令

## 一次性准备

### 1. 安装项目依赖

```bash
pnpm install
```

## 一次性生成 VSIX 包（推荐）

不安装全局 `vsce`，直接用 `pnpm dlx` 临时执行：

```bash
pnpm dlx @vscode/vsce package
```

执行成功后，会在当前目录生成一个 `.vsix` 文件（文件名通常为：`<name>-<version>.vsix`，对应 `package.json` 的 `name` / `version`）。

## 可选：全局安装 vsce（常用打包时可选）

如果你希望后续重复打包更方便，可以配置 pnpm 全局目录后再全局安装：

```bash
pnpm setup
```

关闭并重新打开终端后执行：

```bash
pnpm add -g @vscode/vsce
vsce --version
```

然后使用：

```bash
vsce package
```

## 本地安装 VSIX

### 方法 A：VSCode 图形界面安装

- 打开 VSCode
- 打开扩展面板（Extensions）
- 点击右上角 `...`
- 选择 `Install from VSIX...`
- 选中刚生成的 `.vsix`

### 方法 B：命令行安装

```bash
code --install-extension <path-to-vsix>
```

如果你安装的是 Cursor/Windsurf 等 VSCode 系编辑器，也通常支持类似的 VSIX 安装入口（名称可能略有差异）。

## 常见问题

### 1) `vsce` 报错：缺少 `publisher`

- 现象：`vsce package` 过程中提示 `publisher` 缺失
- 处理：在 `package.json` 补充 `publisher` 字段后再打包

### 2) 找不到 `vsce` 命令

- 确认已执行：`pnpm add -g @vscode/vsce`
- 重新打开终端，让 PATH 生效
- 执行 `vsce --version` 验证

### 3) `pnpm add -g ...` 报错：`ERR_PNPM_NO_GLOBAL_BIN_DIR`

- 现象：全局安装时报 `Unable to find the global bin directory`
- 处理：执行 `pnpm setup` 自动创建并配置全局目录（然后重开终端），或改用本文推荐的一次性方式：`pnpm dlx @vscode/vsce package`

### 4) Windows 安装后功能异常

- 先确认 VSCode 扩展已启用（Extensions 列表中不处于禁用状态）
- 打开 `Output` 面板，切换到扩展对应的输出通道查看错误日志

## 建议的最短流程（复制即用）

```bash
pnpm install
pnpm dlx @vscode/vsce package
```

生成 `.vsix` 后，在 VSCode 中 `Install from VSIX...` 安装即可。

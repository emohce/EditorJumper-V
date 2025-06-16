# EditorJumper-V

<div align="center">
  <img src="image/pluginIcon.png" alt="EditorJumper 图标" width="128" height="128"/>
</div>

<div >
  <img src="https://img.shields.io/badge/VS%20Code-Extension-blue" alt="VS Code 扩展"/>
  <img src="https://img.shields.io/badge/License-MIT-blue" alt="许可证"/>
  <a href="README.md"><img src="https://img.shields.io/badge/Doc-English-blue.svg" alt="English Doc"/></a>
</div>

## 🔍 简介

EditorJumper 是一个 VS Code 类IDE的扩展，允许您在现代代码编辑器（VS Code、Cursor、Trae、Windsurf，Xcode）和 JetBrains IDE（如 IntelliJ IDEA、WebStorm、PyCharm 等）之间无缝跳转。它能够保持光标位置和编辑上下文，大大提高多编辑器环境中的开发效率。

## 🌟 功能特点

- 🚀 **无缝编辑器切换**
  - 快速从 VS Code、Cursor、Trae 或 Windsurf 跳转到 JetBrains IDE
  - 自动定位到相同的光标位置（行和列）
  - 完美保持编辑上下文，不中断工作流

- 🎯 **智能跳转行为**
  - 打开文件时：在目标 IDE 中打开相同的项目和文件，保持光标位置
  - 未打开文件时：直接在目标 IDE 中打开项目

- ⚡ **多种触发方式**
  - 编辑器中右键点击 - 选择"在 JetBrains IDE 中打开"
  - 文件资源管理器中右键点击 - 选择"在 JetBrains IDE 中打开"
  - 可自定义的键盘快捷键

- 🎚️ **简易目标 IDE 选择**
  - 状态栏小部件 - 点击 IDE 图标选择要跳转到的 JetBrains IDE

## 💻 系统要求

- VS Code 1.60.0 或更高版本，或其他支持的编辑器（Cursor、Trae、Windsurf）
- 已安装 JetBrains IDE（IntelliJ IDEA、WebStorm、PyCharm 等）

## 📥 安装

1. 打开 VS Code（或其他支持的编辑器）
2. 转到扩展视图（Ctrl+Shift+X 或 Cmd+Shift+X）
3. 搜索 "EditorJumper"
4. 点击安装按钮

## ⚙️ 配置

1. 打开 VS Code 设置（Ctrl+, 或 Cmd+,）
2. 搜索 "EditorJumper"
3. 配置以下选项：
   - 选择默认 JetBrains IDE
   - 添加或编辑自定义 IDE 配置

您也可以通过点击状态栏上的设置图标（⚙️）快速访问配置界面。

### 配置界面

配置界面允许您：
- 添加新的 IDE 配置
- 编辑现有 IDE 配置
- 隐藏不需要的 IDE
- 选择默认 IDE

对于每个 IDE，您可以配置：
- IDE 名称
- 命令路径（根据操作系统）
- 是否在选择列表中隐藏

## 🚀 使用方法

### 通过右键菜单

1. 在编辑器或文件资源管理器中右键点击
2. 选择"在 JetBrains IDE 中打开"

### 通过状态栏

1. 点击底部状态栏中的 IDE 图标
2. 选择要跳转到的 JetBrains IDE
3. 使用上述任一触发方式执行跳转

## 🔄 列计算

EditorJumper 智能处理制表符（Tab）字符的宽度差异，确保在 JetBrains IDE 中打开文件时光标位置的准确性。

## 🔄 配套使用

为了实现完整的双向工作流，建议将此扩展与 [EditorJumper](https://github.com/wanniwa/EditorJumper) 一起使用，EditorJumper 是一个 JetBrains IDE 插件，允许您从 JetBrains IDE 跳回到 VS Code、Cursor、Trae 或 Windsurf。同时使用这两个工具可以在您所有喜爱的编辑器之间创建无缝的开发体验。

## 🤝 贡献

欢迎提交 Pull Requests 和 Issues 来帮助改进这个扩展！

## 📄 许可证

本项目采用 MIT 许可证 - 详情请参阅 [LICENSE](LICENSE) 文件 

## 常见问题解答

### 问：在Mac上使用EditorJumper时，跳转到IntelliJ IDEA没有反应或出现错误怎么办？

#### 方法一：
1. 打开IntelliJ IDEA。
2. 在菜单栏中选择`Tools`。
3. 点击`Create Command-line Launcher...`。
4. 按照提示完成设置。

#### 方法二：
1. 打开 EditorJumper 设置（Ctrl+, 或 Cmd+,）。
2. 点击在 settings.json 中编辑。
3. 打开访达-应用程序-你想跳转的IDE（如：IDEA）-右键-显示包内容-‘Contents/MacOS/idea’。
4. 右键底部路径：idea，点击 `将idea拷贝为路径名称`。
5. 编辑`editorjumper.ideConfigurations`中对应IDE的配置，将拷贝的路径粘贴至`commandPath`的value处。

*eg.*
```json
{
  "editorjumper.ideConfigurations": [
      
  
    {
      "name": "IDEA",
      "isCustom": false,
      "hidden": false,
      "commandPath": "/Applications/IntelliJ IDEA.app/Contents/MacOS/idea"
    }
  ]
}
```

这样可以确保命令行启动器正确配置，解决跳转问题。
<div align="center">
  <img src="image/macCreateCommand-line.png" alt="macCreateCommand-line" width="600"/>
</div>

--- 

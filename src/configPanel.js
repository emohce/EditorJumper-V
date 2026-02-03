const vscode = require('vscode');
const os = require('os');
const fs = require('fs');
// 避免循环引用
// const extension = require('./extension');

let configPanel = undefined;

/**
 * 创建配置面板
 * @param {vscode.ExtensionContext} context 扩展上下文
 * @returns {vscode.WebviewPanel} 配置面板
 */
function createConfigurationPanel(context) {
    if (configPanel) {
        configPanel.dispose(); // 先销毁旧的面板
    }

    configPanel = vscode.window.createWebviewPanel(
        'ideConfiguration',
        'EditorJumper Configuration',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            retainContextWhenHidden: false, // 不保留隐藏时的上下文
            enableFindWidget: true
        }
    );

    // 强制重新加载配置
    const config = vscode.workspace.getConfiguration('editorjumper');
    configPanel.webview.html = getWebviewContent(config.get('ideConfigurations'));

    configPanel.webview.onDidReceiveMessage(
        async message => {
            const config = vscode.workspace.getConfiguration('editorjumper');
            const ideConfigurations = config.get('ideConfigurations');
            
            console.log('Received message from webview:', message.command, message);
            
            try {
                switch (message.command) {
                    case 'addIDE':
                        const newIDE = message.ide;
                        console.log('Adding new IDE:', newIDE);
                        
                        // 检查是否存在相同名称的非自定义IDE
                        const existingIDE = ideConfigurations.find(ide => ide.name === newIDE.name);
                        
                        // 只有在添加新IDE（非编辑现有IDE）且名称已存在时才提示错误
                        if (newIDE.isCustom === false && 
                            ideConfigurations.some(ide => 
                                ide.isCustom === false && 
                                ide.name === newIDE.name && 
                                // 如果是编辑现有IDE，则不检查自身
                                (!existingIDE || ide !== existingIDE)
                            )) {
                            vscode.window.showErrorMessage(`IDE ${newIDE.name} already exists`);
                            return;
                        }
                        
                        // 如果是编辑现有IDE，保留其他平台的命令路径
                        let updatedIDE = {
                            ...newIDE,
                            isCustom: newIDE.isCustom === true,
                            hidden: newIDE.hidden === true
                        };
                        
                        if (existingIDE) {
                            // 更新现有IDE
                            const updatedConfigurations = ideConfigurations.map(ide => 
                                ide.name === newIDE.name ? updatedIDE : ide
                            );
                            await config.update('ideConfigurations', updatedConfigurations, true);
                        } else {
                            // 添加新IDE
                            await config.update('ideConfigurations', [...ideConfigurations, updatedIDE], true);
                        }
                        
                        vscode.window.showInformationMessage(`IDE configuration saved: ${newIDE.name}`);
                        
                        // 重新获取最新配置并更新WebView
                        const addUpdatedConfig = vscode.workspace.getConfiguration('editorjumper');
                        configPanel.webview.html = getWebviewContent(addUpdatedConfig.get('ideConfigurations'));
                        // 通知主模块更新状态栏
                        vscode.commands.executeCommand('editorjumper.updateStatusBar');
                        break;
                    case 'updateIDE':
                        console.log('Updating IDE:', message.ide);
                        const updatedConfigurations = ideConfigurations.map(ide => 
                            ide.name === message.ide.name ? {
                                ...ide,
                                ...message.ide,
                                isCustom: message.ide.isCustom === true,
                                hidden: message.ide.hidden === true
                            } : ide
                        );
                        await config.update('ideConfigurations', updatedConfigurations, true);
                        
                        // 如果当前选中的IDE被隐藏了，自动选择第一个未隐藏的IDE
                        const selectedIDEForUpdate = config.get('selectedIDE');
                        if (message.ide.name === selectedIDEForUpdate && message.ide.hidden === true) {
                            const firstVisibleIDE = updatedConfigurations.find(ide => !ide.hidden);
                            if (firstVisibleIDE) {
                                await config.update('selectedIDE', firstVisibleIDE.name, true);
                            }
                        }
                        
                        // 重新获取最新配置并更新WebView
                        const updateUpdatedConfig = vscode.workspace.getConfiguration('editorjumper');
                        configPanel.webview.html = getWebviewContent(updateUpdatedConfig.get('ideConfigurations'));
                        // 通知主模块更新状态栏
                        vscode.commands.executeCommand('editorjumper.updateStatusBar');
                        break;
                    case 'removeIDE':
                        console.log('Removing IDE:', message.ideName);
                        const selectedIDEForRemove = config.get('selectedIDE');
                        if (message.ideName === selectedIDEForRemove) {
                            console.log('Cannot remove currently selected IDE');
                            vscode.window.showErrorMessage('Cannot remove currently selected IDE. Please select another IDE first');
                            return;
                        }
                        const filteredConfigurations = ideConfigurations.filter(ide => ide.name !== message.ideName);
                        console.log('Filtered configurations:', filteredConfigurations);
                        console.log('Original configurations:', ideConfigurations);
                        console.log('IDE to remove:', message.ideName);
                        await config.update('ideConfigurations', filteredConfigurations, true);
                        vscode.window.showInformationMessage('IDE configuration removed');
                        
                        // 重新获取最新配置并更新WebView
                        const updatedConfig = vscode.workspace.getConfiguration('editorjumper');
                        configPanel.webview.html = getWebviewContent(updatedConfig.get('ideConfigurations'));
                        // 通知主模块更新状态栏
                        vscode.commands.executeCommand('editorjumper.updateStatusBar');
                        break;
                    case 'selectIDE':
                        console.log('Selecting IDE:', message.ideName);
                        await config.update('selectedIDE', message.ideName, true);
                        
                        // 重新获取最新配置并更新WebView
                        const selectUpdatedConfig = vscode.workspace.getConfiguration('editorjumper');
                        configPanel.webview.html = getWebviewContent(selectUpdatedConfig.get('ideConfigurations'));
                        // 通知主模块更新状态栏
                        vscode.commands.executeCommand('editorjumper.updateStatusBar');
                        break;
                    case 'selectPath':
                        const options = {
                            canSelectFiles: true,
                            canSelectFolders: false,
                            canSelectMany: false,
                            openLabel: 'Select',
                            filters: {}
                        };

                        if (process.platform === 'darwin') {
                            options.canSelectFiles = true;
                            options.canSelectFolders = false; // 不再允许选择文件夹，因为不支持.app路径
                            options.title = 'Select JetBrains IDE Command';
                            options.openLabel = 'Select';
                        }

                        const result = await vscode.window.showOpenDialog(options);
                        if (result && result[0]) {
                            let selectedPath = result[0].fsPath;
                            
                            configPanel.webview.postMessage({
                                command: 'setPath',
                                path: selectedPath
                            });
                        }
                        break;
                    case 'selectPathForRootProject':
                        const folderOptions = {
                            canSelectFiles: false,
                            canSelectFolders: true,
                            canSelectMany: false,
                            openLabel: 'Select Folder',
                            title: 'Select JetBrains Root Project Path (directory containing .idea)'
                        };
                        const folderResult = await vscode.window.showOpenDialog(folderOptions);
                        if (folderResult && folderResult[0]) {
                            await config.update('jetBrainsRootProjectPath', folderResult[0].fsPath, true);
                            const rootUpdatedConfig = vscode.workspace.getConfiguration('editorjumper');
                            configPanel.webview.html = getWebviewContent(rootUpdatedConfig.get('ideConfigurations'));
                        }
                        break;
                    case 'saveRootProjectPath':
                        const pathToSave = (message.path != null && message.path !== undefined) ? String(message.path) : '';
                        await config.update('jetBrainsRootProjectPath', pathToSave, true);
                        vscode.window.showInformationMessage('JetBrains root project path saved.');
                        const saveUpdatedConfig = vscode.workspace.getConfiguration('editorjumper');
                        configPanel.webview.html = getWebviewContent(saveUpdatedConfig.get('ideConfigurations'));
                        break;
                }
            } catch (error) {
                console.error('Error handling message:', error);
                vscode.window.showErrorMessage('Error handling message: ' + error.message);
            }
        },
        undefined,
        context.subscriptions
    );

    configPanel.onDidDispose(
        () => {
            configPanel = undefined;
        },
        null,
        context.subscriptions
    );
    
    return configPanel;
}

/**
 * 获取WebView内容
 * @param {Array} ideConfigurations IDE配置列表
 * @returns {string} WebView HTML内容
 */
function getWebviewContent(ideConfigurations) {
    const ideTypes = ["IDEA", "WebStorm", "PyCharm", "GoLand", "CLion", "PhpStorm", "RubyMine", "Rider", "Android Studio"];
    const config = vscode.workspace.getConfiguration('editorjumper');
    const selectedIDE = config.get('selectedIDE');
    
    // 获取当前平台类型和对应的命令字段名
    const platform = process.platform;
    let commandLabel = 'Command Path';
    
    if (platform === 'darwin') {
        commandLabel = 'Command';
    }

    // 是否是macOS平台
    const isMac = platform === 'darwin';

    const jetBrainsRootProjectPath = (config.get('jetBrainsRootProjectPath') || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

    return `<!DOCTYPE html>
    <html>
    <head>
        <style>
            body { padding: 20px; }
            .ide-list { margin: 20px 0; }
            .ide-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px;
                margin: 5px 0;
                border: 1px solid var(--vscode-input-border);
                border-radius: 4px;
            }
            .ide-info {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .ide-controls {
                display: flex;
                gap: 10px;
            }
            .selected-indicator {
                color: var(--vscode-terminal-ansiGreen);
            }
            .form-group {
                margin: 10px 0;
            }
            .form-group label {
                display: block;
                margin-bottom: 5px;
            }
            .form-group input[type="text"],
            .form-group select {
                width: 100%;
                padding: 5px;
            }
            .form-actions {
                margin-top: 20px;
                display: flex;
                gap: 10px;
            }
            .command-group {
                margin-top: 20px;
            }
            .custom-ide-group {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .action-buttons {
                margin-bottom: 20px;
            }
            button {
                padding: 4px 8px;
                cursor: pointer;
            }
            button:disabled {
                cursor: not-allowed;
                opacity: 0.6;
            }
            .hidden-ide {
                opacity: 0.6;
            }
            .checkbox-group {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .checkbox-group input[type="checkbox"] {
                margin: 0;
            }
            .note {
                margin-top: 5px;
                font-size: 0.9em;
                color: var(--vscode-descriptionForeground);
            }
            .highlight {
                background-color: var(--vscode-editor-selectionBackground);
                border-left: 3px solid var(--vscode-terminal-ansiGreen);
            }
        </style>
    </head>
    <body>
        <h2>EditorJumper Configurations</h2>
        <div class="form-group command-group" style="margin-bottom: 16px;">
            <label for="rootProjectPath">JetBrains 根项目路径（可选）:</label>
            <div style="display: flex; gap: 10px; align-items: center;">
                <input type="text" id="rootProjectPath" style="flex: 1;" value="${jetBrainsRootProjectPath}" placeholder="Directory containing .idea (multi-module / multi-root)">
                <button onclick="selectPathForRootProject()">浏览目录</button>
                <button onclick="saveRootProjectPath()">Save</button>
            </div>
            <div class="note">Leave empty to use workspace folder as project path.</div>
        </div>
        <div class="action-buttons">
            <button onclick="showAddForm()">Add New IDE</button>
        </div>
        <div class="ide-list">
            ${ideConfigurations.map(ide => `
                <div id="ide-${ide.name}" class="ide-item ${ide.hidden ? 'hidden-ide' : ''}">
                    <div class="ide-info">
                        ${ide.name === selectedIDE ? '<span class="selected-indicator">✓</span>' : ''}
                        <div>
                            <strong>${ide.name}</strong>
                            ${ide.isCustom ? ' (Custom)' : ''}
                        </div>
                    </div>
                    <div class="ide-controls">
                        <div class="checkbox-group">
                            <input type="checkbox" id="hidden-${ide.name}" 
                                ${ide.hidden ? 'checked' : ''} 
                                onchange="toggleHidden('${ide.name}')">
                            <label for="hidden-${ide.name}">Hidden</label>
                        </div>
                        <button onclick="editIDE('${ide.name}')">Edit</button>
                        ${ide.isCustom ? `
                            <button onclick="removeIDE('${ide.name}')" 
                                ${ide.name === selectedIDE ? 'disabled title="Cannot remove currently selected IDE"' : ''}>
                                Remove
                            </button>
                        ` : ''}
                        <button onclick="selectIDE('${ide.name}')">${ide.name === selectedIDE ? 'Selected' : 'Select'}</button>
                    </div>
                </div>
            `).join('')}
        </div>

        <div id="ideForm" style="display: none; margin-top: 20px;">
            <h3 id="formTitle">Add New IDE</h3>
            <div class="form-group custom-ide-group">
                <input type="checkbox" id="isCustom" onchange="toggleCustomIDE()">
                <label for="isCustom">Custom IDE</label>
            </div>
            <div class="form-group">
                <label for="ideName">IDE Name:</label>
                <select id="ideName">
                    ${ideTypes.map(type => `<option value="${type}">${type}</option>`).join('')}
                </select>
                <input type="text" id="customName" style="display: none;" placeholder="Enter IDE name">
            </div>
            <div class="form-group checkbox-group">
                <input type="checkbox" id="isHidden">
                <label for="isHidden">Hidden</label>
            </div>
            <div class="form-group command-group" id="commandGroup">
                <div style="flex: 1;">
                    <label for="command">${commandLabel}:</label>
                    <div style="display: flex; gap: 10px;">
                        <input type="text" id="command" style="flex: 1;">
                        <button id="browseButton" onclick="selectPath()">Browse...</button>
                    </div>
                    ${isMac ? `<div class="note">Note: Please provide the command name (e.g., idea, pycharm, webstorm). App paths (.app) are not supported.</div>` : 
                    `<div class="note">Note: If left empty, system default path will be used if available.</div>`}
                </div>
            </div>
            <div class="form-actions">
                <button onclick="saveIDE()">Save</button>
                <button onclick="cancelEdit()">Cancel</button>
            </div>
        </div>

        <script>
            let vscode;
            try {
                vscode = acquireVsCodeApi();
            } catch (error) {
                console.error('Failed to acquire VS Code API:', error);
                alert('Failed to initialize VS Code API. Please reload the window.');
            }
            const configurations = ${JSON.stringify(ideConfigurations)};
            const selectedIDE = '${selectedIDE}';
            const platform = '${platform}';
            const commandLabel = '${commandLabel}';
            const isMac = ${isMac};
            // 跟踪当前正在编辑的IDE名称
            let currentEditingIDE = '';

            function showAddForm() {
                document.getElementById('formTitle').textContent = 'Add New IDE';
                document.getElementById('ideForm').style.display = 'block';
                document.getElementById('isCustom').checked = false;
                document.getElementById('isHidden').checked = false;
                toggleCustomIDE();
                document.getElementById('command').value = '';
                // 重置当前编辑的IDE
                currentEditingIDE = '';
                // 更新下拉选项的禁用状态
                updateSelectOptions();
            }

            function toggleCustomIDE() {
                const isCustom = document.getElementById('isCustom').checked === true;
                const nameSelect = document.getElementById('ideName');
                const customName = document.getElementById('customName');
                const commandGroup = document.getElementById('commandGroup');
                const browseButton = document.getElementById('browseButton');
                
                nameSelect.style.display = isCustom ? 'none' : 'block';
                customName.style.display = isCustom ? 'block' : 'none';
                
                // 更新下拉选项的禁用状态
                updateSelectOptions();
                
                // 在macOS上，只有自定义IDE才能配置路径
                if (isMac) {
                    commandGroup.style.display = isCustom ? 'block' : 'none';
                }
                
                if (isCustom) {
                    customName.value = '';
                    document.getElementById('command').value = '';
                } else {
                    // 更新下拉选项的禁用状态
                    updateSelectOptions();
                    const firstAvailableOption = Array.from(nameSelect.options).find(option => !option.disabled);
                    if (firstAvailableOption) {
                        nameSelect.value = firstAvailableOption.value;
                    }
                    
                    // 在macOS上，非自定义IDE不需要配置路径
                    if (isMac) {
                        document.getElementById('command').value = '';
                    }
                }
            }

            // 更新下拉选项的禁用状态
            function updateSelectOptions() {
                const nameSelect = document.getElementById('ideName');
                if (!nameSelect) return;
                
                Array.from(nameSelect.options).forEach(option => {
                    // 检查是否已存在同名非自定义IDE，但排除当前正在编辑的IDE
                    const isDisabled = configurations.some(ide => 
                        !ide.isCustom && 
                        ide.name === option.value && 
                        ide.name !== currentEditingIDE
                    );
                    option.disabled = isDisabled;
                    option.text = option.value + (isDisabled ? ' (Already exists)' : '');
                });
            }

            function editIDE(name) {
                const ide = configurations.find(i => i.name === name);
                if (!ide) return;

                // 设置当前正在编辑的IDE名称
                currentEditingIDE = name;
                
                document.getElementById('formTitle').textContent = 'Edit IDE';
                document.getElementById('ideForm').style.display = 'block';
                
                const nameSelect = document.getElementById('ideName');
                const customName = document.getElementById('customName');
                const isCustomCheckbox = document.getElementById('isCustom');
                const isHiddenCheckbox = document.getElementById('isHidden');
                const commandGroup = document.getElementById('commandGroup');
                
                isCustomCheckbox.checked = ide.isCustom === true;
                isHiddenCheckbox.checked = ide.hidden === true;
                nameSelect.style.display = ide.isCustom ? 'none' : 'block';
                customName.style.display = ide.isCustom ? 'block' : 'none';
                
                // 更新下拉选项的禁用状态
                updateSelectOptions();
                
                // 在macOS上，只有自定义IDE才能配置路径
                if (isMac) {
                    commandGroup.style.display = ide.isCustom ? 'block' : 'none';
                }
                
                if (ide.isCustom) {
                    customName.value = ide.name;
                } else {
                    nameSelect.value = ide.name;
                }
                
                document.getElementById('command').value = ide.commandPath || '';
            }

            function saveIDE() {
                if (!vscode) {
                    alert('VS Code API not initialized. Please reload the window.');
                    return;
                }
                
                const isCustom = document.getElementById('isCustom').checked === true;
                const name = isCustom ? 
                    document.getElementById('customName').value : 
                    document.getElementById('ideName').value;
                let command = document.getElementById('command').value;
                const isHidden = document.getElementById('isHidden').checked === true;

                // 在macOS上，非自定义IDE不需要命令路径
                if (isMac && !isCustom) {
                    command = '';
                } else if (!isCustom && !command) {
                    // 非macOS平台上，非自定义IDE可以有空命令路径，将使用默认路径
                } else if (isCustom && !command) {
                    alert('Please provide a command name or path');
                    return;
                }

                if (!name) {
                    alert('Please provide an IDE name');
                    return;
                }

                if (isCustom && !name.trim()) {
                    alert('Please enter an IDE name');
                    return;
                }

                // 创建IDE对象，根据当前平台设置命令路径
                const ide = {
                    name: name,
                    isCustom: isCustom,
                    hidden: isHidden,
                    commandPath: command
                };
                
                vscode.postMessage({
                    command: 'addIDE',
                    ide
                });

                document.getElementById('ideForm').style.display = 'none';
            }

            function toggleHidden(name) {
                const ide = configurations.find(i => i.name === name);
                if (!ide) return;

                const isHidden = document.getElementById('hidden-' + name).checked === true;
                
                vscode.postMessage({
                    command: 'updateIDE',
                    ide: {
                        ...ide,
                        hidden: isHidden
                    }
                });
            }

            function cancelEdit() {
                document.getElementById('ideForm').style.display = 'none';
                // 重置当前编辑的IDE
                currentEditingIDE = '';
            }

            function removeIDE(name) {
                if (name === selectedIDE) {
                    return;
                }
                
                vscode.postMessage({
                    command: 'removeIDE',
                    ideName: name
                });
            }

            function selectIDE(name) {
                vscode.postMessage({
                    command: 'selectIDE',
                    ideName: name
                });
            }

            function selectPath() {
                if (!vscode) {
                    alert('VS Code API not initialized. Please reload the window.');
                    return;
                }
                
                const isCustom = document.getElementById('isCustom').checked === true;
                const ideName = isCustom ? 
                    document.getElementById('customName').value : 
                    document.getElementById('ideName').value;
                
                vscode.postMessage({
                    command: 'selectPath',
                    ideType: ideName.toLowerCase()
                });
            }

            function selectPathForRootProject() {
                if (!vscode) {
                    alert('VS Code API not initialized. Please reload the window.');
                    return;
                }
                vscode.postMessage({ command: 'selectPathForRootProject' });
            }

            function saveRootProjectPath() {
                if (!vscode) {
                    alert('VS Code API not initialized. Please reload the window.');
                    return;
                }
                const el = document.getElementById('rootProjectPath');
                const path = el ? el.value : '';
                vscode.postMessage({ command: 'saveRootProjectPath', path: path });
            }

            window.addEventListener('message', event => {
                const message = event.data;
                switch (message.command) {
                    case 'setPath':
                        document.getElementById('command').value = message.path;
                        break;
                    case 'setRootProjectPath':
                        const rootEl = document.getElementById('rootProjectPath');
                        if (rootEl) rootEl.value = message.path || '';
                        break;
                    case 'highlightIDE':
                        const ideElement = document.getElementById('ide-' + message.ideName);
                        if (ideElement) {
                            ideElement.classList.add('highlight');
                            ideElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            setTimeout(() => {
                                editIDE(message.ideName);
                            }, 500);
                        }
                        break;
                }
            });
        </script>
    </body>
    </html>`;
}

/**
 * 高亮显示指定IDE
 * @param {string} ideName IDE名称
 */
function highlightIDE(ideName) {
    if (configPanel) {
        configPanel.webview.postMessage({
            command: 'highlightIDE',
            ideName: ideName
        });
    }
}

module.exports = {
    createConfigurationPanel,
    highlightIDE
}; 
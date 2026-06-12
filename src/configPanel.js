const vscode = require('vscode');
const os = require('os');
const fs = require('fs');
const path = require('path');
const globalConfigStore = require('./globalConfigStore');
const projectConfigStore = require('./projectConfigStore');
const workspaceRouteUtil = require('./workspaceRouteUtil');
const { validateRootProjectPath, getRootProjectOpenDialogOptions } = require('./rootProjectPathUtil');
// 避免循环引用
// const extension = require('./extension');

let configPanel = undefined;

function resolvePanelRouteFilePath(routeFilePath) {
    return routeFilePath !== undefined && routeFilePath !== null
        ? routeFilePath
        : workspaceRouteUtil.resolveRouteFilePath();
}

/**
 * 刷新全局工具配置区块（不影响 project slot / 根路径）
 */
function refreshConfigurationPanel() {
    refreshGlobalSections();
}

function reloadGlobalPanelHtml() {
    refreshGlobalSections();
}

function reloadPanelHtml() {
    reloadGlobalPanelHtml();
}

function buildProjectAnchorBannerHtml(routeFilePath) {
    const anchorPath = projectConfigStore.resolveConfigAnchorPath(routeFilePath);
    const folderPath = anchorPath || '';
    const folderName = folderPath ? path.basename(folderPath) : 'workspace';
    return `<div id="project-anchor-banner" class="note" style="margin-bottom: 12px;">Current project cache anchor: <strong>${escapeHtml(folderName)}</strong> — ${escapeHtml(folderPath || '(none)')}</div>`;
}

function buildSlotListInnerHtml(routeFilePath, ideConfigurations) {
    const slotTargets = projectConfigStore.readProjectFresh(routeFilePath).slotTargets
        || projectConfigStore.defaultSlotTargets();
    const vscodeAppConfigurations = globalConfigStore.getVscodeAppConfigurations();
    const slotShortcuts = ['Shift+Alt+O / Shift+Alt+P', 'Shift+Alt+I', 'Shift+Alt+U'];
    const jetbrainsOptions = ideConfigurations.filter(ide => !ide.hidden).map(ide => ide.name);
    const vscodeAppOptions = vscodeAppConfigurations.filter(app => !app.hidden).map(app => app.name);

    return slotTargets.map((slot, idx) => {
        const options = slot.type === 'jetbrains' ? jetbrainsOptions : vscodeAppOptions;
        const optionHtml = options.map(name => `<option value="${escapeHtml(name)}" ${slot.target === name ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('');

        return `
                <div class="ide-item">
                    <div class="ide-info">
                        <div>
                            <strong>Slot ${slot.slot}</strong>
                            <span class="slot-shortcut">${escapeHtml(slotShortcuts[idx] || '')}</span>
                            <span id="slotSaved-${idx}" class="slot-saved-indicator"></span>
                        </div>
                    </div>
                    <div class="ide-controls" style="gap: 6px;">
                        <select id="slotType-${idx}" style="padding: 4px;">
                            <option value="jetbrains" ${slot.type === 'jetbrains' ? 'selected' : ''}>JetBrains</option>
                            <option value="vscode-app" ${slot.type === 'vscode-app' ? 'selected' : ''}>VSCode App</option>
                        </select>
                        <select id="slotTarget-${idx}" style="padding: 4px; min-width: 140px;">
                            ${!slot.target ? '<option value="" selected>(not set)</option>' : ''}
                            ${optionHtml}
                        </select>
                    </div>
                </div>
            `;
    }).join('');
}

function buildFolderRoutesInnerHtml(routeFilePath) {
    const folderRoutes = projectConfigStore.listFolderRouteConfigs(routeFilePath);
    return folderRoutes.map((route, idx) => `
            <div class="folder-route" style="margin-bottom: 12px; padding: 8px; border: 1px solid var(--vscode-input-border); border-radius: 4px;">
                <label><strong>${escapeHtml(route.folderName)}</strong></label>
                <div class="note" style="margin: 4px 0 8px;">${escapeHtml(route.folderPath)}</div>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <input type="text" id="rootProjectPath-${idx}" data-anchor="${escapeHtml(route.anchorPath)}" class="root-project-input" style="flex: 1;" value="${escapeHtml(route.jetBrainsRootProjectPath || '')}" placeholder="Folder or project file (e.g. .sln/.ipr/.iml)">
                    <button onclick="selectPathForRootProject(${idx})">浏览路径</button>
                </div>
            </div>
        `).join('');
}

function buildProjectSectionsPayload(routeFilePath) {
    const ideConfigurations = globalConfigStore.getIdeConfigurations();
    return {
        anchorBannerHtml: buildProjectAnchorBannerHtml(routeFilePath),
        slotListHtml: buildSlotListInnerHtml(routeFilePath, ideConfigurations),
        folderRoutesHtml: buildFolderRoutesInnerHtml(routeFilePath),
        jetbrainsOptions: ideConfigurations.filter(ide => !ide.hidden).map(ide => ide.name),
        vscodeAppOptions: globalConfigStore.getVscodeAppConfigurations().filter(app => !app.hidden).map(app => app.name)
    };
}

function refreshProjectSections(routeFilePath) {
    if (!configPanel) {
        return;
    }
    const rfp = resolvePanelRouteFilePath(routeFilePath);
    configPanel.webview.postMessage({
        command: 'refreshProjectSections',
        ...buildProjectSectionsPayload(rfp)
    });
}

function buildIdeItemsHtml(ideConfigurations, slot1Target) {
    return ideConfigurations.map(ide => {
        const safeName = escapeHtml(ide.name);
        const rowId = encodeDomId('ide', ide.name);
        const hiddenId = encodeDomId('hidden', ide.name);
        const nameArg = JSON.stringify(ide.name);

        return `
                    <div id="${rowId}" class="ide-item ${ide.hidden ? 'hidden-ide' : ''}">
                        <div class="ide-info">
                            <div>
                                <strong>${safeName}</strong>
                                ${ide.isCustom ? ' (Custom)' : ''}
                            </div>
                        </div>
                        <div class="ide-controls">
                            <div class="checkbox-group">
                                <input type="checkbox" id="${hiddenId}"
                                    ${ide.hidden ? 'checked' : ''}
                                    onchange='toggleHidden(${nameArg}, ${JSON.stringify(hiddenId)})'>
                                <label for="${hiddenId}">Hidden</label>
                            </div>
                            <button onclick='editIDE(${nameArg})'>Edit</button>
                            ${ide.isCustom ? `
                                <button onclick='removeIDE(${nameArg})'
                                    ${ide.name === slot1Target ? 'disabled title="Cannot remove Slot 1 IDE"' : ''}>
                                    Remove
                                </button>
                            ` : ''}
                        </div>
                    </div>
                `;
    }).join('');
}

function buildVscodeAppItemsHtml(vscodeAppConfigurations) {
    return vscodeAppConfigurations.map(app => {
        const safeName = escapeHtml(app.name);
        const hiddenId = encodeDomId('vscapp-hidden', app.name);
        const nameArg = JSON.stringify(app.name);

        return `
                    <div class="ide-item ${app.hidden ? 'hidden-ide' : ''}">
                        <div class="ide-info">
                            <div>
                                <strong>${safeName}</strong>
                                ${app.isCustom ? ' (Custom)' : ''}
                            </div>
                        </div>
                        <div class="ide-controls">
                            <div class="checkbox-group">
                                <input type="checkbox" id="${hiddenId}"
                                    ${app.hidden ? 'checked' : ''}
                                    onchange='toggleVscodeAppHidden(${nameArg}, ${JSON.stringify(hiddenId)})'>
                                <label for="${hiddenId}">Hidden</label>
                            </div>
                            <button onclick='editVscodeApp(${nameArg})'>Edit</button>
                            ${app.isCustom ? `<button onclick='removeVscodeApp(${nameArg})'>Remove</button>` : ''}
                        </div>
                    </div>
                `;
    }).join('');
}

function refreshGlobalSections() {
    if (!configPanel) {
        return;
    }
    const ideConfigurations = globalConfigStore.getIdeConfigurations();
    const vscodeAppConfigurations = globalConfigStore.getVscodeAppConfigurations();
    const routeFilePath = workspaceRouteUtil.resolveRouteFilePath();
    const slot1Target = projectConfigStore.getSlot1Target(routeFilePath);
    configPanel.webview.postMessage({
        command: 'refreshGlobalSections',
        ideItemsHtml: buildIdeItemsHtml(ideConfigurations, slot1Target),
        vscodeAppItemsHtml: buildVscodeAppItemsHtml(vscodeAppConfigurations),
        ideConfigurations,
        vscodeAppConfigurations,
        slot1Target
    });
}

async function syncSlotRuntime(routeFilePath) {
    await vscode.commands.executeCommand('editorjumper.syncProjectConfig', routeFilePath);
}

function handleUpdateSlot(message, routeFilePath) {
    const slotTargets = projectConfigStore.readProjectFresh(routeFilePath).slotTargets
        || projectConfigStore.defaultSlotTargets();
    const mergedSlotTargets = [
        slotTargets[0] || { slot: 1, type: 'jetbrains', target: '' },
        slotTargets[1] || { slot: 2, type: 'vscode-app', target: '' },
        slotTargets[2] || { slot: 3, type: 'vscode-app', target: '' }
    ];
    const slotIdx = message.slotIndex;
    if (slotIdx < 0 || slotIdx >= mergedSlotTargets.length) {
        return;
    }
    const slotTarget = message.slotTarget || '';
    if (!slotTarget) {
        return;
    }
    mergedSlotTargets[slotIdx] = {
        slot: slotIdx + 1,
        type: message.slotType,
        target: slotTarget
    };
    projectConfigStore.setSlotTargets(mergedSlotTargets, routeFilePath);
    syncSlotRuntime(routeFilePath);
    if (configPanel) {
        configPanel.webview.postMessage({
            command: 'slotSaved',
            slotIndex: slotIdx
        });
    }
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function encodeDomId(prefix, value) {
    return `${prefix}-${Buffer.from(String(value ?? ''), 'utf8').toString('base64url')}`;
}

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
        'Ez-EditorJumper-V Configuration',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            retainContextWhenHidden: false, // 不保留隐藏时的上下文
            enableFindWidget: true
        }
    );

    // 强制重新加载配置
    const config = vscode.workspace.getConfiguration('editorjumper');
    const collapsedSections = config.get('collapsedSections') || { 'jetbrains-section': true, 'vscode-section': true };
    configPanel.webview.html = getWebviewContent(globalConfigStore.getIdeConfigurations(), collapsedSections);

    configPanel.webview.onDidReceiveMessage(
        async message => {
            const routeFilePath = workspaceRouteUtil.resolveRouteFilePath();
            const config = vscode.workspace.getConfiguration('editorjumper');
            const ideConfigurations = globalConfigStore.getIdeConfigurations();
            
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
                        
                        globalConfigStore.upsertApp('jetbrains', updatedIDE);
                        
                        vscode.window.showInformationMessage(`IDE configuration saved: ${newIDE.name}`);
                        reloadGlobalPanelHtml();
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
                        globalConfigStore.replaceIdeConfigurations(updatedConfigurations);
                        
                        if (message.ide.name === projectConfigStore.getSlot1Target(routeFilePath) && message.ide.hidden === true) {
                            const firstVisibleIDE = updatedConfigurations.find(ide => !ide.hidden);
                            if (firstVisibleIDE) {
                                const slots = projectConfigStore.getSlotTargets(routeFilePath);
                                slots[0] = { slot: 1, type: 'jetbrains', target: firstVisibleIDE.name };
                                projectConfigStore.setSlotTargets(slots, routeFilePath);
                                syncSlotRuntime(routeFilePath);
                                refreshProjectSections(routeFilePath);
                            }
                        }
                        reloadGlobalPanelHtml();
                        // 通知主模块更新状态栏
                        vscode.commands.executeCommand('editorjumper.updateStatusBar');
                        break;
                    case 'removeIDE':
                        console.log('Removing IDE:', message.ideName);
                        if (message.ideName === projectConfigStore.getSlot1Target(routeFilePath)) {
                            console.log('Cannot remove currently selected IDE');
                            vscode.window.showErrorMessage('Cannot remove Slot 1 IDE. Please select another IDE first');
                            return;
                        }
                        globalConfigStore.removeApp('jetbrains', message.ideName);
                        vscode.window.showInformationMessage('IDE configuration removed');
                        reloadGlobalPanelHtml();
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
                        const folderResult = await vscode.window.showOpenDialog(getRootProjectOpenDialogOptions());
                        if (folderResult && folderResult[0]) {
                            const selectedRootPath = folderResult[0].fsPath;
                            const rootPathCheck = validateRootProjectPath(selectedRootPath);
                            if (!rootPathCheck.ok) {
                                vscode.window.showErrorMessage(rootPathCheck.message);
                                break;
                            }
                            projectConfigStore.setJetBrainsRootProjectPath(
                                selectedRootPath,
                                routeFilePath,
                                message.folderAnchor
                            );
                            refreshProjectSections(routeFilePath);
                            configPanel.webview.postMessage({
                                command: 'setRootProjectPath',
                                path: selectedRootPath,
                                folderAnchor: message.folderAnchor
                            });
                        }
                        break;
                    case 'saveRootProjectPath':
                        const pathToSave = (message.path != null && message.path !== undefined) ? String(message.path) : '';
                        const savePathCheck = validateRootProjectPath(pathToSave);
                        if (!savePathCheck.ok) {
                            vscode.window.showErrorMessage(savePathCheck.message);
                            break;
                        }
                        projectConfigStore.setJetBrainsRootProjectPath(
                            pathToSave,
                            routeFilePath,
                            message.folderAnchor
                        );
                        refreshProjectSections(routeFilePath);
                        break;
                    case 'updateSlot':
                        handleUpdateSlot(message, routeFilePath);
                        break;

                    case 'addVscodeApp':
                        const newApp = message.app;
                        globalConfigStore.upsertApp('vscode', {
                            ...newApp,
                            isCustom: newApp.isCustom === true,
                            hidden: newApp.hidden === true
                        });
                        vscode.window.showInformationMessage(`VSCode app configuration saved: ${newApp.name}`);
                        reloadGlobalPanelHtml();
                        vscode.commands.executeCommand('editorjumper.updateStatusBar');
                        break;

                    case 'updateVscodeApp':
                        const vscodeAppsForUpdate = globalConfigStore.getVscodeAppConfigurations();
                        const updatedVscodeApps = vscodeAppsForUpdate.map(a =>
                            a.name === message.app.name ? {
                                ...a,
                                ...message.app,
                                isCustom: message.app.isCustom === true,
                                hidden: message.app.hidden === true
                            } : a
                        );
                        globalConfigStore.replaceVscodeAppConfigurations(updatedVscodeApps);
                        reloadGlobalPanelHtml();
                        vscode.commands.executeCommand('editorjumper.updateStatusBar');
                        break;

                    case 'removeVscodeApp':
                        globalConfigStore.removeApp('vscode', message.appName);
                        vscode.window.showInformationMessage('VSCode app configuration removed');
                        reloadGlobalPanelHtml();
                        vscode.commands.executeCommand('editorjumper.updateStatusBar');
                        break;

                    case 'selectVscodeAppPath':
                        const appPathOptions = {
                            canSelectFiles: true,
                            canSelectFolders: false,
                            canSelectMany: false,
                            openLabel: 'Select',
                            title: 'Select VSCode App Command'
                        };
                        const appPathResult = await vscode.window.showOpenDialog(appPathOptions);
                        if (appPathResult && appPathResult[0]) {
                            configPanel.webview.postMessage({
                                command: 'setVscodeAppPath',
                                path: appPathResult[0].fsPath
                            });
                        }
                        break;

                    case 'toggleSection':
                        const currentCollapsed = config.get('collapsedSections') || { 'jetbrains-section': true, 'vscode-section': true };
                        currentCollapsed[message.sectionId] = message.collapsed;
                        await config.update('collapsedSections', currentCollapsed, true);
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
 * @param {Object} collapsedSections 折叠状态对象
 * @returns {string} WebView HTML内容
 */
function getWebviewContent(ideConfigurations, collapsedSections = { 'jetbrains-section': true, 'vscode-section': true }) {
    const ideTypes = ["IDEA", "WebStorm", "PyCharm", "GoLand", "CLion", "PhpStorm", "RubyMine", "Rider", "Android Studio"];
    const config = vscode.workspace.getConfiguration('editorjumper');
    const routeFilePath = workspaceRouteUtil.resolveRouteFilePath();
    const slot1Target = projectConfigStore.getSlot1Target(routeFilePath);
    
    // 获取当前平台类型和对应的命令字段名
    const platform = process.platform;
    let commandLabel = 'Command Path';
    
    if (platform === 'darwin') {
        commandLabel = 'Command';
    }

    // 是否是macOS平台
    const isMac = platform === 'darwin';

    const vscodeAppConfigurations = globalConfigStore.getVscodeAppConfigurations();
    const projectPayload = buildProjectSectionsPayload(routeFilePath);
    const slotItemsHtml = projectPayload.slotListHtml;
    const folderRoutesHtml = projectPayload.folderRoutesHtml;
    const anchorBannerHtml = projectPayload.anchorBannerHtml;
    const jetbrainsOptions = projectPayload.jetbrainsOptions;
    const vscodeAppOptions = projectPayload.vscodeAppOptions;
    const ideItemsHtml = buildIdeItemsHtml(ideConfigurations, slot1Target);
    const vscodeAppItemsHtml = buildVscodeAppItemsHtml(vscodeAppConfigurations);

    return `<!DOCTYPE html>
    <html>
    <head>
        <style>
            body { padding: 15px; }
            h2 { margin: 15px 0 10px 0; }
            h3 { margin: 10px 0; }
            .ide-list { 
                margin: 12px 0;
                display: flex;
                flex-wrap: wrap;
                gap: 12px;
            }
            .slot-list {
                margin: 8px 0;
            }
            .slot-list .ide-item {
                margin-bottom: 16px;
            }
            .collapsible-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                cursor: pointer;
                padding: 6px 10px;
                background: var(--vscode-editor-background);
                border: 1px solid var(--vscode-input-border);
                border-radius: 4px;
                margin: 6px 0;
            }
            .collapsible-header:hover {
                background: var(--vscode-list-hoverBackground);
            }
            .collapsible-content {
                display: block;
            }
            .collapsible-content.collapsed {
                display: none;
            }
            .ide-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 6px 12px;
                margin: 2px 0;
                border: 1px solid var(--vscode-input-border);
                border-radius: 4px;
            }
            .ide-info {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-right: 12px;
            }
            .ide-controls {
                display: flex;
                align-items: center;
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
                min-width: 52px;
            }
            button:disabled {
                cursor: not-allowed;
                opacity: 0.6;
            }
            .hidden-ide {
                opacity: 0.6;
            }
            .checkbox-group {
                display: none;
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
            .slot-shortcut {
                color: var(--vscode-descriptionForeground);
                margin-left: 8px;
            }
            .slot-saved-indicator {
                color: var(--vscode-terminal-ansiGreen);
                margin-left: 6px;
                font-size: 0.85em;
            }
        </style>
    </head>
    <body>
        <h2>Ez-EditorJumper-V Configurations</h2>

        <!-- ========== Shortcut Slots (Primary Section) ========== -->
        <div id="project-slots-section">
        <h2>Shortcut Slots</h2>
        <div class="note" style="margin-bottom: 16px;">Each slot is bound to a keyboard shortcut. Slots below apply to the sub-project of the currently focused editor (or the first workspace folder when no editor is open). Changes are saved automatically to OS cache.</div>
        ${anchorBannerHtml}
        <div class="slot-list" id="project-slot-list">
            ${slotItemsHtml}
        </div>
        </div>

        <!-- ========== JetBrains Root Project Path (per workspace folder) ========== -->
        <div id="project-rootpaths-section" class="form-group command-group" style="margin-bottom: 16px; margin-top: 20px;">
            <label>JetBrains 根项目路径（按工作区子项目）:</label>
            <div class="note" style="margin: 6px 0 10px;">每个 workspace 子项目可单独配置 Rider .sln、IDEA 目录等；留空则跳转时使用该子项目文件夹。配置保存在 OS 全局缓存，VS-IDE 间共用。跳转时以当前聚焦编辑器所在子项目为准。</div>
            <div id="project-folder-routes">
            ${folderRoutesHtml}
            </div>
        </div>

        <hr style="margin: 30px 0;">

        <!-- ========== JetBrains IDE Configuration (Collapsible) ========== -->
        <div class="collapsible-header" onclick="toggleCollapsible('jetbrains-section')">
            <div>
                <strong>JetBrains IDE Configuration</strong>
                <span class="slot-shortcut">Click to expand/collapse</span>
            </div>
            <span id="jetbrains-section-toggle">${collapsedSections['jetbrains-section'] ? '▶' : '▼'}</span>
        </div>
        <div id="jetbrains-section" class="collapsible-content ${collapsedSections['jetbrains-section'] ? 'collapsed' : ''}">
            <div class="action-buttons">
                <button onclick="showAddForm()">Add New IDE</button>
            </div>
            <div class="ide-list" id="jetbrains-ide-list">
                ${ideItemsHtml}
            </div>
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

        <hr style="margin: 30px 0;">

        <!-- ========== VSCode-Rooted Editors (Collapsible) ========== -->
        <div class="collapsible-header" onclick="toggleCollapsible('vscode-section')">
            <div>
                <strong>VSCode-Rooted Editors</strong>
                <span class="slot-shortcut">Click to expand/collapse</span>
            </div>
            <span id="vscode-section-toggle">${collapsedSections['vscode-section'] ? '▶' : '▼'}</span>
        </div>
        <div id="vscode-section" class="collapsible-content ${collapsedSections['vscode-section'] ? 'collapsed' : ''}">
            <div class="action-buttons">
                <button onclick="showAddVscodeAppForm()">Add New Editor</button>
            </div>
            <div class="ide-list" id="vscode-app-list">
                ${vscodeAppItemsHtml}
            </div>
        </div>

        <div id="vscodeAppForm" style="display: none; margin-top: 20px;">
            <h3 id="vscodeAppFormTitle">Add New Editor</h3>
            <div class="form-group">
                <label for="vscodeAppName">Editor Name:</label>
                <input type="text" id="vscodeAppName" placeholder="e.g. MyEditor">
            </div>
            <div class="form-group checkbox-group">
                <input type="checkbox" id="vscodeAppHidden">
                <label for="vscodeAppHidden">Hidden</label>
            </div>
            <div class="form-group command-group">
                <div style="flex: 1;">
                    <label for="vscodeAppCommand">Command Path:</label>
                    <div style="display: flex; gap: 10px;">
                        <input type="text" id="vscodeAppCommand" style="flex: 1;" placeholder="e.g. myeditor or /path/to/myeditor">
                        <button onclick="selectVscodeAppPath()">Browse...</button>
                    </div>
                    <div class="note">If left empty, the default command name will be used.</div>
                </div>
            </div>
            <div class="form-actions">
                <button onclick="saveVscodeApp()">Save</button>
                <button onclick="cancelVscodeAppEdit()">Cancel</button>
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
            let configurations = ${JSON.stringify(ideConfigurations)};
            let slot1Target = ${JSON.stringify(slot1Target)};
            const platform = '${platform}';
            const commandLabel = '${commandLabel}';
            const isMac = ${isMac};
            // 跟踪当前正在编辑的IDE名称
            let currentEditingIDE = '';

            function toggleCollapsible(sectionId) {
                const section = document.getElementById(sectionId);
                const toggle = document.getElementById(sectionId + '-toggle');
                if (section.classList.contains('collapsed')) {
                    section.classList.remove('collapsed');
                    toggle.textContent = '▼';
                    vscode.postMessage({
                        command: 'toggleSection',
                        sectionId: sectionId,
                        collapsed: false
                    });
                } else {
                    section.classList.add('collapsed');
                    toggle.textContent = '▶';
                    vscode.postMessage({
                        command: 'toggleSection',
                        sectionId: sectionId,
                        collapsed: true
                    });
                }
            }

            function showAddForm() {
                document.getElementById('formTitle').textContent = 'Add New IDE';
                document.getElementById('ideForm').style.display = 'block';
                document.getElementById('isCustom').checked = false;
                document.getElementById('isCustom').disabled = false;
                document.getElementById('isHidden').checked = false;
                document.getElementById('ideName').disabled = false;
                document.getElementById('customName').disabled = false;
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
                isCustomCheckbox.disabled = true;
                isHiddenCheckbox.checked = ide.hidden === true;
                nameSelect.style.display = ide.isCustom ? 'none' : 'block';
                customName.style.display = ide.isCustom ? 'block' : 'none';
                nameSelect.disabled = true;
                customName.disabled = true;
                
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
                const name = (isCustom ? 
                    document.getElementById('customName').value : 
                    document.getElementById('ideName').value).trim();
                let command = document.getElementById('command').value.trim();
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
                    command: currentEditingIDE ? 'updateIDE' : 'addIDE',
                    ide
                });

                document.getElementById('ideForm').style.display = 'none';
                currentEditingIDE = '';
            }

            function toggleHidden(name, checkboxId) {
                const ide = configurations.find(i => i.name === name);
                if (!ide) return;

                const isHidden = document.getElementById(checkboxId).checked === true;
                
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
                document.getElementById('isCustom').disabled = false;
                document.getElementById('ideName').disabled = false;
                document.getElementById('customName').disabled = false;
                // 重置当前编辑的IDE
                currentEditingIDE = '';
            }

            function removeIDE(name) {
                if (name === slot1Target) {
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

            function selectPathForRootProject(idx) {
                if (!vscode) {
                    alert('VS Code API not initialized. Please reload the window.');
                    return;
                }
                const el = document.getElementById('rootProjectPath-' + idx);
                const folderAnchor = el ? el.getAttribute('data-anchor') : '';
                vscode.postMessage({ command: 'selectPathForRootProject', folderAnchor: folderAnchor });
            }

            // ========== Slot / root path（cache 驱动）==========
            let jetbrainsOptions = ${JSON.stringify(jetbrainsOptions)};
            let vscodeAppOptions = ${JSON.stringify(vscodeAppOptions)};
            const rootSaveTimers = {};

            function onSlotTypeChange(idx) {
                const typeSelect = document.getElementById('slotType-' + idx);
                const targetSelect = document.getElementById('slotTarget-' + idx);
                if (!typeSelect || !targetSelect) return;

                const type = typeSelect.value;
                const options = type === 'jetbrains' ? jetbrainsOptions : vscodeAppOptions;
                const currentValue = targetSelect.value;
                targetSelect.innerHTML = '<option value="">(not set)</option>' + options
                    .map(name => '<option value="' + escapeHtmlText(name) + '">' + escapeHtmlText(name) + '</option>')
                    .join('');
                targetSelect.value = options.includes(currentValue) ? currentValue : '';
            }

            function autoSaveSlot(idx) {
                const typeSelect = document.getElementById('slotType-' + idx);
                const targetSelect = document.getElementById('slotTarget-' + idx);
                if (!typeSelect || !targetSelect || !vscode) return;
                if (!targetSelect.value) return;

                vscode.postMessage({
                    command: 'updateSlot',
                    slotIndex: idx,
                    slotType: typeSelect.value,
                    slotTarget: targetSelect.value
                });
            }

            function onRootProjectInput(e) {
                const el = e.target;
                const folderAnchor = el ? el.getAttribute('data-anchor') : '';
                if (!folderAnchor || !vscode) return;
                clearTimeout(rootSaveTimers[folderAnchor]);
                rootSaveTimers[folderAnchor] = setTimeout(() => {
                    vscode.postMessage({
                        command: 'saveRootProjectPath',
                        path: el.value,
                        folderAnchor: folderAnchor
                    });
                }, 500);
            }

            function bindProjectSectionEvents() {
                document.querySelectorAll('.root-project-input').forEach((input) => {
                    input.removeEventListener('input', onRootProjectInput);
                    input.addEventListener('input', onRootProjectInput);
                });
                const slotListEl = document.getElementById('project-slot-list');
                if (slotListEl && !slotListEl.dataset.slotBound) {
                    slotListEl.dataset.slotBound = '1';
                    slotListEl.addEventListener('change', (e) => {
                        const t = e.target;
                        if (!t || !t.id) return;
                        if (t.id.startsWith('slotType-')) {
                            const idx = parseInt(t.id.slice('slotType-'.length), 10);
                            onSlotTypeChange(idx);
                            autoSaveSlot(idx);
                        } else if (t.id.startsWith('slotTarget-')) {
                            const idx = parseInt(t.id.slice('slotTarget-'.length), 10);
                            autoSaveSlot(idx);
                        }
                    });
                }
            }

            function applyProjectSections(message) {
                if (message.anchorBannerHtml) {
                    const existing = document.getElementById('project-anchor-banner');
                    if (existing) {
                        existing.outerHTML = message.anchorBannerHtml;
                    }
                }
                const slotList = document.getElementById('project-slot-list');
                if (slotList && message.slotListHtml) {
                    slotList.innerHTML = message.slotListHtml;
                }
                const folderRoutes = document.getElementById('project-folder-routes');
                if (folderRoutes && message.folderRoutesHtml) {
                    folderRoutes.innerHTML = message.folderRoutesHtml;
                }
                if (Array.isArray(message.jetbrainsOptions)) {
                    jetbrainsOptions = message.jetbrainsOptions;
                }
                if (Array.isArray(message.vscodeAppOptions)) {
                    vscodeAppOptions = message.vscodeAppOptions;
                }
                bindProjectSectionEvents();
            }

            function applyGlobalSections(message) {
                const ideList = document.getElementById('jetbrains-ide-list');
                if (ideList && message.ideItemsHtml) {
                    ideList.innerHTML = message.ideItemsHtml;
                }
                const vscodeList = document.getElementById('vscode-app-list');
                if (vscodeList && message.vscodeAppItemsHtml) {
                    vscodeList.innerHTML = message.vscodeAppItemsHtml;
                }
                if (Array.isArray(message.ideConfigurations)) {
                    configurations = message.ideConfigurations;
                }
                if (Array.isArray(message.vscodeAppConfigurations)) {
                    vscodeAppConfigurations = message.vscodeAppConfigurations;
                }
                if (message.slot1Target !== undefined) {
                    slot1Target = message.slot1Target;
                }
            }

            // ========== VSCode App 相关函数 ==========
            let vscodeAppConfigurations = ${JSON.stringify(vscodeAppConfigurations)};
            let currentEditingVscodeApp = '';

            function showAddVscodeAppForm() {
                document.getElementById('vscodeAppFormTitle').textContent = 'Add New Editor';
                document.getElementById('vscodeAppForm').style.display = 'block';
                document.getElementById('vscodeAppName').value = '';
                document.getElementById('vscodeAppName').disabled = false;
                document.getElementById('vscodeAppHidden').checked = false;
                document.getElementById('vscodeAppCommand').value = '';
                currentEditingVscodeApp = '';
            }

            function editVscodeApp(name) {
                const app = vscodeAppConfigurations.find(a => a.name === name);
                if (!app) return;

                currentEditingVscodeApp = name;
                document.getElementById('vscodeAppFormTitle').textContent = 'Edit Editor';
                document.getElementById('vscodeAppForm').style.display = 'block';
                document.getElementById('vscodeAppName').value = app.name;
                document.getElementById('vscodeAppName').disabled = true;
                document.getElementById('vscodeAppHidden').checked = app.hidden === true;
                document.getElementById('vscodeAppCommand').value = app.commandPath || '';
            }

            function saveVscodeApp() {
                if (!vscode) {
                    alert('VS Code API not initialized. Please reload the window.');
                    return;
                }

                const name = document.getElementById('vscodeAppName').value.trim();
                const isHidden = document.getElementById('vscodeAppHidden').checked === true;
                const commandPath = document.getElementById('vscodeAppCommand').value.trim();

                if (!name || !name.trim()) {
                    alert('Please provide an editor name');
                    return;
                }

                const isCustom = currentEditingVscodeApp
                    ? (vscodeAppConfigurations.find(a => a.name === currentEditingVscodeApp) || {}).isCustom === true
                    : true;

                vscode.postMessage({
                    command: currentEditingVscodeApp ? 'updateVscodeApp' : 'addVscodeApp',
                    app: {
                        name: name,
                        isCustom: isCustom,
                        hidden: isHidden,
                        commandPath: commandPath || null
                    }
                });

                document.getElementById('vscodeAppForm').style.display = 'none';
                currentEditingVscodeApp = '';
            }

            function cancelVscodeAppEdit() {
                document.getElementById('vscodeAppForm').style.display = 'none';
                document.getElementById('vscodeAppName').disabled = false;
                currentEditingVscodeApp = '';
            }

            function toggleVscodeAppHidden(name, checkboxId) {
                const app = vscodeAppConfigurations.find(a => a.name === name);
                if (!app) return;

                const isHidden = document.getElementById(checkboxId).checked === true;

                vscode.postMessage({
                    command: 'updateVscodeApp',
                    app: {
                        ...app,
                        hidden: isHidden
                    }
                });
            }

            function removeVscodeApp(name) {
                vscode.postMessage({
                    command: 'removeVscodeApp',
                    appName: name
                });
            }

            function selectVscodeAppPath() {
                if (!vscode) {
                    alert('VS Code API not initialized. Please reload the window.');
                    return;
                }
                vscode.postMessage({ command: 'selectVscodeAppPath' });
            }

            window.addEventListener('message', event => {
                const message = event.data;
                switch (message.command) {
                    case 'setPath':
                        document.getElementById('command').value = message.path;
                        break;
                    case 'setRootProjectPath':
                        if (message.folderAnchor) {
                            document.querySelectorAll('[data-anchor]').forEach((rootEl) => {
                                if (rootEl.getAttribute('data-anchor') === message.folderAnchor) {
                                    rootEl.value = message.path || '';
                                }
                            });
                        }
                        break;
                    case 'highlightIDE':
                        const ideElement = document.getElementById(domId('ide', message.ideName));
                        if (ideElement) {
                            ideElement.classList.add('highlight');
                            ideElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            setTimeout(() => {
                                editIDE(message.ideName);
                            }, 500);
                        }
                        break;
                    case 'setVscodeAppPath':
                        const appCmdEl = document.getElementById('vscodeAppCommand');
                        if (appCmdEl) appCmdEl.value = message.path;
                        break;
                    case 'refreshProjectSections':
                        applyProjectSections(message);
                        break;
                    case 'refreshGlobalSections':
                        applyGlobalSections(message);
                        break;
                    case 'slotSaved': {
                        const indicator = document.getElementById('slotSaved-' + message.slotIndex);
                        if (indicator) {
                            indicator.textContent = 'saved';
                            setTimeout(() => { indicator.textContent = ''; }, 1500);
                        }
                        break;
                    }
                }
            });

            bindProjectSectionEvents();

            function domId(prefix, value) {
                return prefix + '-' + btoa(unescape(encodeURIComponent(String(value || ''))))
                    .replace(/\\+/g, '-')
                    .replace(/\\//g, '_')
                    .replace(/=+$/g, '');
            }

            function escapeHtmlText(value) {
                return String(value)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;');
            }
        </script>
    </body>
    </html>
    `;
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
    highlightIDE,
    refreshConfigurationPanel,
    refreshProjectSections,
    refreshGlobalSections
}; 

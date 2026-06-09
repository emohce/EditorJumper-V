const vscode = require('vscode');
const projectConfigStore = require('./projectConfigStore');
const workspaceRouteUtil = require('./workspaceRouteUtil');

const SLOT_SHORTCUTS = ['Shift+Alt+O / Shift+Alt+P', 'Shift+Alt+I', 'Shift+Alt+U'];
const SETTINGS_SHORTCUT = process.platform === 'darwin' ? 'Cmd+Shift+Alt+V' : 'Ctrl+Shift+Alt+V';

let providerInstance = null;

function escapeHtml(value) {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function buildSlotPickerHtml(slotTargets) {
	const itemsHtml = slotTargets.map((slot, index) => {
		const shortcut = SLOT_SHORTCUTS[index] || '';
		const target = slot.target || '(not configured)';
		const line = `Slot ${slot.slot} (${shortcut}): ${target}`;
		return `<button class="slot-item" data-index="${index}">${escapeHtml(line)}</button>`;
	}).join('');

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<style>
		:root {
			color: var(--vscode-foreground);
			background: var(--vscode-editor-background);
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
		}
		body {
			margin: 0;
			padding: 0;
			min-height: 100%;
			display: flex;
			flex-direction: column;
			justify-content: flex-end;
		}
		.menu {
			display: flex;
			flex-direction: column;
			border-top: 1px solid var(--vscode-panel-border, var(--vscode-widget-border));
		}
		.title {
			padding: 4px 10px;
			font-size: 11px;
			color: var(--vscode-descriptionForeground);
			border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-widget-border));
		}
		.slot-item {
			display: block;
			width: 100%;
			box-sizing: border-box;
			margin: 0;
			padding: 6px 10px;
			border: 0;
			border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-widget-border));
			background: transparent;
			color: inherit;
			text-align: left;
			cursor: pointer;
			font: inherit;
		}
		.slot-item:hover,
		.slot-item:focus {
			background: var(--vscode-list-hoverBackground);
			outline: none;
		}
		.separator {
			border-top: 1px solid var(--vscode-panel-border, var(--vscode-widget-border));
		}
		.slot-item-settings {
			color: var(--vscode-textLink-foreground);
		}
	</style>
</head>
<body>
	<div class="menu">
		<div class="title">Jump via Shortcut Slot</div>
		${itemsHtml}
		<div class="separator"></div>
		<button class="slot-item slot-item-settings" data-action="settings">Settings (${escapeHtml(SETTINGS_SHORTCUT)})</button>
	</div>
	<script>
		const vscode = acquireVsCodeApi();
		document.querySelectorAll('.slot-item[data-index]').forEach((btn) => {
			btn.addEventListener('click', () => {
				const index = Number(btn.getAttribute('data-index'));
				vscode.postMessage({ command: 'pickSlot', index });
			});
		});
		document.querySelector('[data-action="settings"]')?.addEventListener('click', () => {
			vscode.postMessage({ command: 'openSettings' });
		});
	</script>
</body>
</html>`;
}

class SlotPickerViewProvider {
	constructor(onPickSlot) {
		this.onPickSlot = onPickSlot;
		this.view = null;
		this.isOpen = false;
	}

	resolveWebviewView(webviewView) {
		this.view = webviewView;
		webviewView.webview.options = {
			enableScripts: true
		};
		webviewView.onDidChangeVisibility((visible) => {
			if (!visible) {
				this.isOpen = false;
			}
		});
		webviewView.webview.onDidReceiveMessage(async (message) => {
			if (message.command !== 'pickSlot' && message.command !== 'openSettings') {
				return;
			}
			try {
				if (message.command === 'pickSlot' && message.index != null) {
					await this.onPickSlot(message.index);
				} else if (message.command === 'openSettings') {
					await vscode.commands.executeCommand('editorjumper.configureIDE');
				}
			} finally {
				await this.hide();
			}
		});
		this.refresh();
	}

	refresh() {
		if (!this.view) {
			return;
		}
		const routeFilePath = workspaceRouteUtil.resolveRouteFilePath();
		const slotTargets = projectConfigStore.getSlotTargets(routeFilePath);
		this.view.webview.html = buildSlotPickerHtml(slotTargets);
	}

	async show() {
		if (this.isOpen) {
			await this.hide();
			return;
		}
		await vscode.commands.executeCommand('editorjumper.slotPicker.focus');
		this.isOpen = true;
		this.refresh();
	}

	async hide() {
		this.isOpen = false;
		await vscode.commands.executeCommand('workbench.action.closePanel');
	}
}

function register(context, onPickSlot) {
	providerInstance = new SlotPickerViewProvider(async (index) => {
		await onPickSlot(undefined, index);
	});
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('editorjumper.slotPicker', providerInstance, {
			webviewOptions: {
				retainContextWhenHidden: true
			}
		})
	);
}

function show() {
	if (providerInstance) {
		return providerInstance.show();
	}
	return Promise.resolve();
}

function refresh() {
	if (providerInstance) {
		providerInstance.refresh();
	}
}

module.exports = {
	register,
	show,
	refresh
};

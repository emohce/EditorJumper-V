// 默认IDE路径配置
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

// IDE统一配置：包含URL Scheme、App Names等信息
const ideConfigs = {
    'IDEA': {
        urlScheme: 'idea',
        macAppNames: ['IntelliJ IDEA Ultimate.app', 'IntelliJ IDEA.app', 'IntelliJ IDEA CE.app', 'IntelliJ IDEA Community Edition.app'],
        supportsFastMode: true
    },
    'WebStorm': {
        urlScheme: 'webstorm',
        macAppNames: ['WebStorm.app', 'webstorm'],
        supportsFastMode: true
    },
    'PyCharm': {
        urlScheme: 'pycharm',
        macAppNames: ['PyCharm Professional Edition.app', 'PyCharm.app', 'PyCharm CE.app', 'PyCharm Community Edition.app'],
        supportsFastMode: true
    },
    'GoLand': {
        urlScheme: 'goland',
        macAppNames: ['GoLand.app'],
        supportsFastMode: true
    },
    'CLion': {
        urlScheme: 'clion',
        macAppNames: ['CLion.app'],
        supportsFastMode: true
    },
    'PhpStorm': {
        urlScheme: 'phpstorm',
        macAppNames: ['PhpStorm.app'],
        supportsFastMode: true
    },
    'RubyMine': {
        urlScheme: 'rubymine',
        macAppNames: ['RubyMine.app'],
        supportsFastMode: true
    },
    'Rider': {
        urlScheme: 'rider',
        macAppNames: ['Rider.app'],
        supportsFastMode: true
    },
    'Android Studio': {
        urlScheme: 'studio',
        macAppNames: ['Android Studio.app'],
        supportsFastMode: true
    },
    'Xcode': {
        urlScheme: null,
        macAppNames: ['Xcode.app'],
        supportsFastMode: false
    }
};

// 向后兼容：导出ideAppNames
const ideAppNames = {};
Object.keys(ideConfigs).forEach(key => {
    ideAppNames[key] = ideConfigs[key].macAppNames;
});

// 直接返回命令名称，不执行查找
const defaultIDEPaths = {
    'IDEA': {
        darwin: 'idea',
        win32: 'idea',
        linux: 'idea'
    },
    'WebStorm': {
        darwin: 'webstorm',
        win32: 'webstorm',
        linux: 'webstorm'
    },
    'PyCharm': {
        darwin: 'pycharm',
        win32: 'pycharm',
        linux: 'pycharm'
    },
    'GoLand': {
        darwin: 'goland',
        win32: 'goland',
        linux: 'goland'
    },
    'CLion': {
        darwin: 'clion',
        win32: 'clion',
        linux: 'clion'
    },
    'PhpStorm': {
        darwin: 'phpstorm',
        win32: 'phpstorm',
        linux: 'phpstorm'
    },
    'RubyMine': {
        darwin: 'rubymine',
        win32: 'rubymine',
        linux: 'rubymine'
    },
    'Rider': {
        darwin: 'rider',
        win32: 'rider',
        linux: 'rider'
    },
    'Android Studio': {
        darwin: 'studio',
        win32: 'studio',
        linux: 'studio'
    },
    'Xcode': {
        darwin: '/Applications/Xcode.app/Contents/MacOS/Xcode'
    }
};

// VSCode-rooted app 统一配置
const vscodeAppConfigs = {
    'Visual Studio Code': {
        command: { darwin: 'code', win32: 'Code', linux: 'code' },
        macAppName: 'Visual Studio Code',
        urlScheme: 'vscode'
    },
    'Cursor': {
        command: { darwin: 'cursor', win32: 'Cursor', linux: 'cursor' },
        macAppName: 'Cursor',
        urlScheme: 'cursor'
    },
    'Windsurf': {
        command: { darwin: 'windsurf', win32: 'Windsurf', linux: 'windsurf' },
        macAppName: 'Windsurf',
        urlScheme: 'windsurf'
    },
    'Trae': {
        command: { darwin: 'trae', win32: 'Trae', linux: 'trae' },
        macAppName: 'Trae',
        urlScheme: 'trae'
    },
    'Void': {
        command: { darwin: 'void', win32: 'void', linux: 'void' },
        macAppName: 'Void',
        urlScheme: 'void'
    },
    'Kiro': {
        command: { darwin: 'kiro', win32: 'kiro', linux: 'kiro' },
        macAppName: 'Kiro',
        urlScheme: 'kiro'
    },
    'Qoder': {
        command: { darwin: 'qoder', win32: 'qoder', linux: 'qoder' },
        macAppName: 'Qoder',
        urlScheme: 'qoder'
    },
    'CatPawAI': {
        command: { darwin: 'CatPawAI', win32: 'CatPawAI', linux: 'CatPawAI' },
        macAppName: 'CatPawAI',
        urlScheme: 'catpaw'
    },
    'Antigravity': {
        command: { darwin: 'antigravity', win32: 'antigravity', linux: 'antigravity' },
        macAppName: 'Antigravity',
        urlScheme: 'antigravity'
    }
};

const vscodeAppNameAliases = {
    'Code': 'Visual Studio Code',
    'VS Code': 'Visual Studio Code',
    'Visual Studio Code': 'Visual Studio Code',
    'Visual Studio Code - Insiders': 'Visual Studio Code',
    'Cursor': 'Cursor',
    'Cursor Nightly': 'Cursor',
    'Cursor - Insiders': 'Cursor',
    'Windsurf': 'Windsurf',
    'Codeium Windsurf': 'Windsurf',
    'Windsurf Next': 'Windsurf',
    'Trae': 'Trae',
    'Void': 'Void',
    'Kiro': 'Kiro',
    'Qoder': 'Qoder',
    'CatPawAI': 'CatPawAI',
    'Antigravity': 'Antigravity'
};

function normalizeVscodeAppName(appName) {
    if (!appName || typeof appName !== 'string') {
        return '';
    }

    const trimmed = appName.trim();
    if (vscodeAppNameAliases[trimmed]) {
        return vscodeAppNameAliases[trimmed];
    }

    const builtinName = Object.keys(vscodeAppConfigs).find(name => trimmed === name || trimmed.includes(name));
    return builtinName || trimmed;
}

// Slot 2 智能对等编辑器映射
const smartPeerMap = {
    'Cursor': 'Windsurf',
    'Windsurf': 'Cursor',
    'Visual Studio Code': 'Cursor',
    'Trae': 'Cursor',
    'Void': 'Cursor',
    'Kiro': 'Cursor',
    'Qoder': 'Cursor',
    'CatPawAI': 'Cursor',
    'Antigravity': 'Cursor'
};

// 导出统一配置
module.exports = defaultIDEPaths;
module.exports.ideConfigs = ideConfigs;
module.exports.ideAppNames = ideAppNames;
module.exports.vscodeAppConfigs = vscodeAppConfigs;
module.exports.vscodeAppNameAliases = vscodeAppNameAliases;
module.exports.normalizeVscodeAppName = normalizeVscodeAppName;
module.exports.smartPeerMap = smartPeerMap;

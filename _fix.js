const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'configPanel.js');
let content = fs.readFileSync(filePath, 'utf8');

// The problem: after </html> there should be a backtick + semicolon to close the template literal,
// then a closing brace for getWebviewContent function.
// Currently it's: </html>\r\n}; or </html>\n};
// We need:       </html>` + ;\r\n} or </html>` + ;\n}

const bt = String.fromCharCode(96); // backtick character

// Try both line ending styles
const patterns = [
    { old: '</html>\r\n};', newStr: '</html>' + bt + ';\r\n}' },
    { old: '</html>\n};', newStr: '</html>' + bt + ';\n}' },
    { old: '</html>\r\n\r\n/**', newStr: '</html>' + bt + ';\r\n}\r\n\r\n/**' },
    { old: '</html>\n\n/**', newStr: '</html>' + bt + ';\n}\n\n/**' },
];

let fixed = false;
for (const p of patterns) {
    if (content.includes(p.old)) {
        content = content.replace(p.old, p.newStr);
        fs.writeFileSync(filePath, content, 'utf8');
        fs.writeFileSync(path.join(__dirname, '_fix_result.txt'), 'Fixed with pattern: ' + JSON.stringify(p.old), 'utf8');
        fixed = true;
        break;
    }
}

if (!fixed) {
    // Dump what's around </html> for debugging
    const idx = content.indexOf('</html>');
    let debug = 'Not fixed. idx=' + idx + '\n';
    if (idx >= 0) {
        const after = content.substring(idx, idx + 30);
        debug += 'After: ' + JSON.stringify(after) + '\n';
        debug += 'Has backtick after html: ' + (content.charAt(idx + 7) === bt) + '\n';
    }
    fs.writeFileSync(path.join(__dirname, '_fix_result.txt'), debug, 'utf8');
}

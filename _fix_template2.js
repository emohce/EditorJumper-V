const fs = require('fs');
const f = __dirname + '/src/configPanel.js';
let c = fs.readFileSync(f, 'utf8');

// Find </html> and check what follows
const idx = c.indexOf('</html>');
let result = 'idx=' + idx + '\n';
if (idx >= 0) {
    const after = c.substring(idx + 7, idx + 20);
    result += 'after=' + JSON.stringify(after) + '\n';
    
    // Try CRLF first
    if (c.includes('</html>\r\n};')) {
        c = c.replace('</html>\r\n};', '</html>`;\r\n}');
        fs.writeFileSync(f, c, 'utf8');
        result += 'Fixed CRLF\n';
    } else if (c.includes('</html>\n};')) {
        c = c.replace('</html>\n};', '</html>`;\n}');
        fs.writeFileSync(f, c, 'utf8');
        result += 'Fixed LF\n';
    } else {
        result += 'Pattern not found\n';
        result += 'has backtick: ' + c.includes('</html>`') + '\n';
    }
}

fs.writeFileSync(__dirname + '/_fix_result.txt', result, 'utf8');

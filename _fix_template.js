const fs = require('fs');
const f = 'e:/work/CzzWork/GitPublic/EditorJumper-V/src/configPanel.js';
let c = fs.readFileSync(f, 'utf8');
console.log('File length:', c.length);

// Find </html> and check what follows
const idx = c.indexOf('</html>');
console.log('Index of </html>:', idx);
if (idx >= 0) {
    const after = c.substring(idx + 7, idx + 20);
    console.log('After </html>:', JSON.stringify(after));
    
    // We need: </html>` + ;\n}  (backtick semicolon newline closebrace)
    // Currently it's: </html>\r\n};\r\n  or  </html>\n};\n
    
    // Try CRLF first
    let oldStr = '</html>\r\n};';
    let newStr = '</html>`;\r\n}';
    if (c.includes(oldStr)) {
        c = c.replace(oldStr, newStr);
        fs.writeFileSync(f, c, 'utf8');
        console.log('Fixed (CRLF)');
    } else {
        oldStr = '</html>\n};';
        newStr = '</html>`;\n}';
        if (c.includes(oldStr)) {
            c = c.replace(oldStr, newStr);
            fs.writeFileSync(f, c, 'utf8');
            console.log('Fixed (LF)');
        } else {
            console.log('Pattern not found - checking if already has backtick');
            const hasBacktick = c.includes('</html>`');
            console.log('Has backtick:', hasBacktick);
        }
    }
}

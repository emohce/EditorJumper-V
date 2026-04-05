f = r'e:\work\CzzWork\GitPublic\EditorJumper-V\src\configPanel.js'
r = r'e:\work\CzzWork\GitPublic\EditorJumper-V\_fix_result.txt'

with open(f, 'r', encoding='utf-8') as fh:
    c = fh.read()

idx = c.find('</html>')
bt = chr(96)
debug = 'idx=' + str(idx) + '\n'

if idx >= 0:
    after_chars = [str(ord(ch)) for ch in c[idx+7:idx+17]]
    debug += 'after_codes=' + ','.join(after_chars) + '\n'

    old_crlf = '</html>\r\n};'
    old_lf = '</html>\n};'

    if old_crlf in c:
        c = c.replace(old_crlf, '</html>' + bt + ';\r\n}', 1)
        with open(f, 'w', encoding='utf-8') as fh:
            fh.write(c)
        debug += 'FIXED_CRLF\n'
    elif old_lf in c:
        c = c.replace(old_lf, '</html>' + bt + ';\n}', 1)
        with open(f, 'w', encoding='utf-8') as fh:
            fh.write(c)
        debug += 'FIXED_LF\n'
    else:
        debug += 'NO_MATCH\n'

with open(r, 'w', encoding='utf-8') as fh:
    fh.write(debug)

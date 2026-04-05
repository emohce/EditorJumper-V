import os

f = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'src', 'configPanel.js')
with open(f, 'r', encoding='utf-8') as fh:
    c = fh.read()

idx = c.find('</html>')
debug = f'idx={idx}\n'
if idx >= 0:
    after = c[idx+7:idx+17]
    debug += f'after={repr(after)}\n'

bt = chr(96)  # backtick

# Try CRLF
old1 = '</html>\r\n};'
new1 = '</html>' + bt + ';\r\n}'
# Try LF
old2 = '</html>\n};'
new2 = '</html>' + bt + ';\n}'

if old1 in c:
    c = c.replace(old1, new1, 1)
    with open(f, 'w', encoding='utf-8') as fh:
        fh.write(c)
    debug += 'FIXED_CRLF\n'
elif old2 in c:
    c = c.replace(old2, new2, 1)
    with open(f, 'w', encoding='utf-8') as fh:
        fh.write(c)
    debug += 'FIXED_LF\n'
else:
    debug += 'NO_MATCH\n'
    debug += f'has_backtick_after_html={bt in c[idx+7:idx+10]}\n'

result_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_fix_result.txt')
with open(result_path, 'w', encoding='utf-8') as fh:
    fh.write(debug)

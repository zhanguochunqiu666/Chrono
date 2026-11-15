#!/usr/bin/env python3
"""把 PWA 打包成单个 HTML(双击即可在电脑上离线使用)。
用法: python3 tools/build_single.py [输出路径] [--extra 额外JS文件]"""
import sys, os, re, base64
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rd = lambda n: open(os.path.join(root, n), encoding='utf-8').read()
out = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else os.path.join(root, 'Chrono-单文件版.html')
extra = ''
if '--extra' in sys.argv:
    extra = open(sys.argv[sys.argv.index('--extra') + 1], encoding='utf-8').read()
html = rd('index.html')
css = rd('style.css')
html = re.sub(r'<link rel="stylesheet" href="style.css">', lambda m: '<style>\n' + css + '\n</style>', html)
icon = base64.b64encode(open(os.path.join(root, 'icons/icon-192.png'), 'rb').read()).decode()
html = html.replace('<link rel="manifest" href="manifest.json">', '')
html = html.replace('href="icons/icon-192.png"', 'href="data:image/png;base64,%s"' % icon)
html = html.replace('<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">', '')
errcatch = """<script>window.addEventListener('error',function(e){var d=document.getElementById('__err')||document.body.appendChild(Object.assign(document.createElement('pre'),{id:'__err',style:'position:fixed;z-index:999;left:0;right:0;top:0;background:#fee;color:#900;font:12px monospace;padding:8px;white-space:pre-wrap;margin:0'}));d.textContent+=e.message+' @'+(e.filename||'').split('/').pop()+':'+e.lineno+'\\n';});</script>"""
if '__boot' not in html: html = html.replace('<script src="core.js"></script>', errcatch + '\n<script src="core.js"></script>')
for n in ['core.js', 'holiday.js', 'parse.js', 'sched.js', 'app.js', 'views.js', 'today.js', 'llm.js', 'sync.js', 'longterm.js', 'remote.js', 'agent.js', 'boot.js']:
    html = html.replace('<script src="%s"></script>' % n, '<script>\n' + rd(n).replace('</script>', '<\\/script>') + '\n</script>')
if extra:
    html = html.replace('</body>', '<script>\n' + extra + '\n</script>\n</body>')
open(out, 'w', encoding='utf-8').write(html)
print('written', out, len(html) // 1024, 'KB')

#!/usr/bin/env python3
"""从子集 woff2 的 cmap 更新 style.css 的 unicode-range（保留 CooperZhengKaiFull）。"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[2]
FONT = ROOT / 'files/CooperZhengKai-1.4.woff2'
CSS = ROOT / 'style.css'

sp = next((REPO / '.venv-font/lib').glob('python*/site-packages'))
sys.path.insert(0, str(sp))
from fontTools.ttLib import TTFont

ver = '6'
m = re.search(r'woff2\?v=(\d+)', CSS.read_text(encoding='utf-8') if CSS.exists() else '')
if m:
    ver = m.group(1)
if len(sys.argv) > 1:
    ver = sys.argv[1]

font = TTFont(str(FONT))
cmap = {}
for t in font['cmap'].tables:
    cmap.update(t.cmap)
cps = sorted(cp for cp in cmap if cp >= 0x20)
ranges = []
start = prev = cps[0]
for cp in cps[1:]:
    if cp == prev + 1:
        prev = cp
        continue
    ranges.append((start, prev))
    start = prev = cp
ranges.append((start, prev))

def fmt(a, b):
    return f'U+{a:04X}' if a == b else f'U+{a:04X}-{b:04X}'

ur = ', '.join(fmt(a, b) for a, b in ranges)
CSS.write_text(
    "/* 汇迹正楷 CooperZhengKai 1.4\n"
    " *\n"
    " * 优先级（见 landing.html --font-kai）：\n"
    " *   1. CooperZhengKai      → UI 子集（仅 unicode-range 内码位，体积小，优先加载）\n"
    " *   2. CooperZhengKaiFull  → 完整字库（子集没有的字走这里，仍是汇迹正楷）\n"
    " *\n"
    " * 完整字库随站点部署；仅在页面出现子集外汉字时按需下载。\n"
    " */\n"
    "@font-face {\n"
    "  font-family: 'CooperZhengKai';\n"
    "  font-style: normal;\n"
    "  font-weight: 400;\n"
    "  font-display: swap;\n"
    f"  src: url('./files/CooperZhengKai-1.4.woff2?v={ver}') format('woff2');\n"
    f"  unicode-range: {ur};\n"
    "}\n"
    "\n"
    "@font-face {\n"
    "  font-family: 'CooperZhengKaiFull';\n"
    "  font-style: normal;\n"
    "  font-weight: 400;\n"
    "  font-display: swap;\n"
    f"  src: url('./files/CooperZhengKai-1.4.full.woff2?v={ver}') format('woff2');\n"
    "}\n",
    encoding='utf-8',
)
print(f'wrote {CSS} v={ver} ranges={len(ranges)} glyphs={len(cps)}')

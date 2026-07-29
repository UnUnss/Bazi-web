#!/usr/bin/env python3
"""从子集 woff2 的 cmap 生成 style.css 的 unicode-range（缺字才能按 font-family 回退到系统楷体）。"""
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

ver = '3'
m = re.search(r'woff2\?v=(\d+)', CSS.read_text(encoding='utf-8') if CSS.exists() else '')
if m:
    ver = str(int(m.group(1)) + 1) if False else m.group(1)  # keep caller-controlled; default read

# allow override: python write-unicode-range.py 4
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
    "/* 汇迹正楷 CooperZhengKai 1.4（站点 UI 子集；完整字库 *.full.woff2 仅本地保留、不入库不线上加载）。\n"
    "   必须声明 unicode-range：仅覆盖子集实际含有的码位。\n"
    "   否则缺字时 Chromium 会绕过 font-family 后续楷体，直接落到系统黑体。 */\n"
    "@font-face {\n"
    "  font-family: 'CooperZhengKai';\n"
    "  font-style: normal;\n"
    "  font-weight: 400;\n"
    "  font-display: swap;\n"
    f"  src: url('./files/CooperZhengKai-1.4.woff2?v={ver}') format('woff2');\n"
    f"  unicode-range: {ur};\n"
    "}\n",
    encoding='utf-8',
)
print(f'wrote {CSS} v={ver} ranges={len(ranges)} glyphs={len(cps)}')

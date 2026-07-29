#!/usr/bin/env bash
# 重新生成 CooperZhengKai UI 子集。需要：完整字库 files/*.full.woff2、本目录 subset-chars.txt、
# 以及项目根目录的 .venv-font（python3 -m venv .venv-font && .venv-font/bin/pip install 'fonttools[woff]' brotli）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$ROOT/../../.." && pwd)"
FULL="$ROOT/files/CooperZhengKai-1.4.full.woff2"
OUT="$ROOT/files/CooperZhengKai-1.4.woff2"
CHARS="$ROOT/subset-chars.txt"
PYFT="$REPO/.venv-font/bin/pyftsubset"

if [[ ! -f "$FULL" ]]; then
  echo "缺少完整字库: $FULL" >&2
  exit 1
fi
if [[ ! -x "$PYFT" ]]; then
  echo "缺少 pyftsubset，请先创建 .venv-font 并安装 fonttools[woff]" >&2
  exit 1
fi

"$PYFT" "$FULL" \
  --text-file="$CHARS" \
  --flavor=woff2 \
  --output-file="$OUT.tmp.woff2" \
  --layout-features='*' \
  --glyph-names \
  --symbol-cmap \
  --legacy-cmap \
  --notdef-glyph \
  --notdef-outline \
  --recommended-glyphs \
  --name-IDs='*' \
  --name-legacy \
  --name-languages='*'

mv "$OUT.tmp.woff2" "$OUT"
ls -lh "$OUT"

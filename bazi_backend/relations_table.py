# 六冲
LIU_CHONG = [{'子', '午'}, {'丑', '未'}, {'寅', '申'}, {'卯', '酉'}, {'辰', '戌'}, {'巳', '亥'}]

# 六合 (返回化出的五行)
LIU_HE = {
    frozenset(['子', '丑']): '土',
    frozenset(['寅', '亥']): '木',
    frozenset(['卯', '戌']): '火',
    frozenset(['辰', '酉']): '金',
    frozenset(['巳', '申']): '水',
    frozenset(['午', '未']): '土'
}

# 三合局 (全合) -> 化出五行
SAN_HE = {
    frozenset(['申', '子', '辰']): '水',
    frozenset(['亥', '卯', '未']): '木',
    frozenset(['寅', '午', '戌']): '火',
    frozenset(['巳', '酉', '丑']): '金'
}

# 半三合局 (任两支) -> 化出五行
def get_ban_san_he(b1, b2):
    pair = frozenset([b1, b2])
    for combo, element in SAN_HE.items():
        if pair.issubset(combo):
            return element
    return None

# 三会局 -> 化出五行
SAN_HUI = {
    frozenset(['寅', '卯', '辰']): '木',
    frozenset(['巳', '午', '未']): '火',
    frozenset(['申', '酉', '戌']): '金',
    frozenset(['亥', '子', '丑']): '水'
}

# 半三会局
def get_ban_san_hui(b1, b2):
    pair = frozenset([b1, b2])
    for combo, element in SAN_HUI.items():
        if pair.issubset(combo):
            return element
    return None

# 相刑 (寅巳申, 丑戌未, 子卯, 自刑)
XIANG_XING = [
    frozenset(['寅', '巳']), frozenset(['巳', '申']), frozenset(['寅', '申']),
    frozenset(['丑', '戌']), frozenset(['戌', '未']), frozenset(['丑', '未']),
    frozenset(['子', '卯'])
]
ZI_XING = {'辰', '午', '酉', '亥'}

# 六害
LIU_HAI = [
    frozenset(['子', '未']), frozenset(['丑', '午']), frozenset(['寅', '巳']),
    frozenset(['卯', '辰']), frozenset(['申', '亥']), frozenset(['酉', '戌'])
]

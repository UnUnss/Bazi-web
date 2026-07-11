# 五行天干映射
GAN_TO_WUXING = {
    '甲': '木', '乙': '木',
    '丙': '火', '丁': '火',
    '戊': '土', '己': '土',
    '庚': '金', '辛': '金',
    '壬': '水', '癸': '水'
}

# 五行相生关系 (key生value)
WUXING_SHENG = {
    '木': '火', '火': '土', '土': '金', '金': '水', '水': '木'
}

# 五行相克关系 (key克value)
WUXING_KE = {
    '木': '土', '土': '水', '水': '火', '火': '金', '金': '木'
}

# 藏干权重
WEIGHT_BEN_QI = 0.6
WEIGHT_ZHONG_QI = 0.3
WEIGHT_YU_QI = 0.1
WEIGHT_TIANGAN = 1.0  # 天干的默认权重

# 月支得令系数
MONTH_COMMAND_MULTIPLIER = 1.5

# 静态喜用基础分
STATIC_FAVORABLE_BASE_SCORE = 5

# 动态流月打分权重
SCORE_LIUCHONG = -2
SCORE_LIUHE_BASE = 1
SCORE_LIUHE_EXTRA = 1
SCORE_SANHE_FULL = 3
SCORE_SANHE_HALF = 1.5
SCORE_SANHUI_FULL = 3
SCORE_SANHUI_HALF = 1.5
SCORE_XING = -1
SCORE_HAI = -1

# 领域判断相关参数
# 最低分和次低分差距小于总分(绝对值之和)的多少比例时，认为两者都很弱
WEAK_DOMAIN_THRESHOLD_RATIO = 0.1


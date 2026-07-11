from config import WEIGHT_BEN_QI, WEIGHT_ZHONG_QI, WEIGHT_YU_QI

# 地支藏干表
# 格式: {地支: {天干: 权重}}
CANGGAN_TABLE = {
    '子': {'癸': WEIGHT_BEN_QI},
    '丑': {'己': WEIGHT_BEN_QI, '辛': WEIGHT_ZHONG_QI, '癸': WEIGHT_YU_QI},
    '寅': {'甲': WEIGHT_BEN_QI, '丙': WEIGHT_ZHONG_QI, '戊': WEIGHT_YU_QI},
    '卯': {'乙': WEIGHT_BEN_QI},
    '辰': {'戊': WEIGHT_BEN_QI, '癸': WEIGHT_ZHONG_QI, '乙': WEIGHT_YU_QI},
    '巳': {'丙': WEIGHT_BEN_QI, '庚': WEIGHT_ZHONG_QI, '戊': WEIGHT_YU_QI},
    '午': {'丁': WEIGHT_BEN_QI, '己': WEIGHT_ZHONG_QI},
    '未': {'己': WEIGHT_BEN_QI, '乙': WEIGHT_ZHONG_QI, '丁': WEIGHT_YU_QI},
    '申': {'庚': WEIGHT_BEN_QI, '壬': WEIGHT_ZHONG_QI, '戊': WEIGHT_YU_QI},
    '酉': {'辛': WEIGHT_BEN_QI},
    '戌': {'戊': WEIGHT_BEN_QI, '丁': WEIGHT_ZHONG_QI, '辛': WEIGHT_YU_QI},
    '亥': {'壬': WEIGHT_BEN_QI, '甲': WEIGHT_ZHONG_QI}
}

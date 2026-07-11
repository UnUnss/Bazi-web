from config import GAN_TO_WUXING, WUXING_SHENG, WUXING_KE, WEIGHT_TIANGAN, MONTH_COMMAND_MULTIPLIER
from canggan_table import CANGGAN_TABLE

def get_base_element_scores(bazi):
    scores = {'金': 0.0, '木': 0.0, '水': 0.0, '火': 0.0, '土': 0.0}
    
    # 解析四柱天干和地支
    pillars = ['year', 'month', 'day', 'time']
    for pillar in pillars:
        if pillar not in bazi:
            continue
            
        # 天干累加
        gan = bazi[pillar]['gan']
        gan_wuxing = GAN_TO_WUXING.get(gan)
        if gan_wuxing:
            scores[gan_wuxing] += WEIGHT_TIANGAN
        
        # 地支藏干累加
        zhi = bazi[pillar]['zhi']
        canggan_dict = CANGGAN_TABLE.get(zhi, {})
        for c_gan, weight in canggan_dict.items():
            c_wuxing = GAN_TO_WUXING.get(c_gan)
            if c_wuxing:
                scores[c_wuxing] += weight
            
    return scores

def determine_strength(bazi):
    scores = get_base_element_scores(bazi)
    day_master = bazi['day']['gan']
    dm_wuxing = GAN_TO_WUXING[day_master]
    
    # 找出生我的五行 (印)
    yin_wuxing = None
    for k, v in WUXING_SHENG.items():
        if v == dm_wuxing:
            yin_wuxing = k
            break
            
    # 同类分: 比劫(本五行) + 印(生我的)
    tong_lei_score = scores[dm_wuxing] + (scores[yin_wuxing] if yin_wuxing else 0)
    
    # 异类分: 其他三个五行
    yi_lei_score = sum(scores.values()) - tong_lei_score
    
    # 月支得令加权
    # 月支本气若同日主五行或生日主，同类分乘以系数
    month_zhi = bazi['month']['zhi']
    month_canggan = CANGGAN_TABLE.get(month_zhi, {})
    if month_canggan:
        # 在CANGGAN_TABLE里，权重最大的那个是本气
        ben_qi = max(month_canggan, key=month_canggan.get)
        ben_qi_wuxing = GAN_TO_WUXING.get(ben_qi)
        
        if ben_qi_wuxing == dm_wuxing or ben_qi_wuxing == yin_wuxing:
            tong_lei_score *= MONTH_COMMAND_MULTIPLIER
        
    is_strong = tong_lei_score > yi_lei_score
    
    return {
        "is_strong": is_strong,
        "tong_lei_score": tong_lei_score,
        "yi_lei_score": yi_lei_score,
        "base_scores": scores,
        "dm_wuxing": dm_wuxing,
        "yin_wuxing": yin_wuxing
    }

def get_static_favorable(bazi):
    strength_info = determine_strength(bazi)
    dm_wuxing = strength_info['dm_wuxing']
    yin_wuxing = strength_info['yin_wuxing']
    
    # 我克的(财), 克我的(官杀), 我生的(食伤)
    cai_wuxing = WUXING_KE[dm_wuxing]
    shishang_wuxing = WUXING_SHENG[dm_wuxing]
    guansha_wuxing = None
    for k, v in WUXING_KE.items():
        if v == dm_wuxing:
            guansha_wuxing = k
            break
            
    if strength_info['is_strong']:
        # 身强 -> 喜用 = 财、官杀、食伤，忌 = 印、比劫
        favorable = [cai_wuxing, guansha_wuxing, shishang_wuxing]
        avoid = [yin_wuxing, dm_wuxing]
        status = "身强"
    else:
        # 身弱 -> 喜用 = 印、比劫，忌 = 财、官杀、食伤
        favorable = [yin_wuxing, dm_wuxing]
        avoid = [cai_wuxing, guansha_wuxing, shishang_wuxing]
        status = "身弱"
        
    return {
        "shen_qiang_ruo": status,
        "static_favorable": favorable,
        "static_avoid": avoid,
        "base_scores": strength_info["base_scores"]
    }

from config import *
from relations_table import *
from strength import get_static_favorable
from canggan_table import CANGGAN_TABLE
import copy

def get_zhi_main_wuxing(zhi):
    # 返回地支本气的五行
    canggan = CANGGAN_TABLE.get(zhi, {})
    if not canggan:
        return None
    ben_qi = max(canggan, key=canggan.get)
    return GAN_TO_WUXING.get(ben_qi)

def calculate_dynamic_score(bazi, liuyue_zhi, static_favorable):
    dynamic_scores = {'金': 0.0, '木': 0.0, '水': 0.0, '火': 0.0, '土': 0.0}
    yuanju_zhis = [bazi['year']['zhi'], bazi['month']['zhi'], bazi['day']['zhi'], bazi['time']['zhi']]
    
    ly_main_wx = get_zhi_main_wuxing(liuyue_zhi)
    
    # 检查流月与原局各支的关系
    for yz in yuanju_zhis:
        pair = frozenset([liuyue_zhi, yz])
        yz_main_wx = get_zhi_main_wuxing(yz)
        
        # 六冲
        if set(pair) in LIU_CHONG:
            if yz_main_wx:
                dynamic_scores[yz_main_wx] += SCORE_LIUCHONG
            
        # 六合
        if pair in LIU_HE:
            if ly_main_wx: dynamic_scores[ly_main_wx] += SCORE_LIUHE_BASE
            if yz_main_wx: dynamic_scores[yz_main_wx] += SCORE_LIUHE_BASE
            hua_wx = LIU_HE[pair]
            if hua_wx in static_favorable:
                dynamic_scores[hua_wx] += SCORE_LIUHE_EXTRA
                
        # 相刑
        if pair in XIANG_XING or (liuyue_zhi == yz and liuyue_zhi in ZI_XING):
            if ly_main_wx: dynamic_scores[ly_main_wx] += SCORE_XING
            if yz_main_wx: dynamic_scores[yz_main_wx] += SCORE_XING
            
        # 六害
        if pair in LIU_HAI:
            if ly_main_wx: dynamic_scores[ly_main_wx] += SCORE_HAI
            if yz_main_wx: dynamic_scores[yz_main_wx] += SCORE_HAI
            
    # 三合/三会局 (全合判断需要流月 + 原局里找出两支)
    import itertools
    yuanju_pairs = list(itertools.combinations(yuanju_zhis, 2))
    found_full_combo = False
    
    # 三合全
    for p in yuanju_pairs:
        trio = frozenset([liuyue_zhi, p[0], p[1]])
        if trio in SAN_HE:
            dynamic_scores[SAN_HE[trio]] += SCORE_SANHE_FULL
            found_full_combo = True
            
    # 三会全
    for p in yuanju_pairs:
        trio = frozenset([liuyue_zhi, p[0], p[1]])
        if trio in SAN_HUI:
            dynamic_scores[SAN_HUI[trio]] += SCORE_SANHUI_FULL
            found_full_combo = True
            
    # 如果没有全合，再算半合
    if not found_full_combo:
        for yz in yuanju_zhis:
            # 半三合
            ban_he_wx = get_ban_san_he(liuyue_zhi, yz)
            if ban_he_wx:
                dynamic_scores[ban_he_wx] += SCORE_SANHE_HALF
            # 半三会
            ban_hui_wx = get_ban_san_hui(liuyue_zhi, yz)
            if ban_hui_wx:
                dynamic_scores[ban_hui_wx] += SCORE_SANHUI_HALF

    return dynamic_scores

def get_monthly_favorable_element(bazi: dict, liuyue_zhi: str) -> dict:
    static_info = get_static_favorable(bazi)
    static_fav = static_info['static_favorable']
    static_avoid = static_info['static_avoid']
    
    # 计算当月动态得分
    dynamic_scores = calculate_dynamic_score(bazi, liuyue_zhi, static_fav)
    
    # 结合静态喜用分和动态分得出综合分
    final_score = copy.deepcopy(dynamic_scores)
    for wx in static_fav:
        final_score[wx] += STATIC_FAVORABLE_BASE_SCORE
        
    # 找出得分最高的五行
    highest_wx = max(final_score, key=final_score.get)
    is_boosted = highest_wx in static_fav
    
    warning = None
    if highest_wx in static_avoid:
        warning = f"本月忌神({highest_wx})偏旺，建议谨慎/中性，多运用喜用五行({','.join(static_fav)})化解。"
        
    return {
        "shen_qiang_ruo": static_info['shen_qiang_ruo'],
        "static_favorable": static_fav,
        "static_avoid": static_avoid,
        "monthly_dynamic_score": dynamic_scores,
        "final_score": final_score,
        "favorable_element_this_month": highest_wx,
        "is_favorable_boosted": is_boosted,
        "warning": warning
    }

# 测试入口
if __name__ == '__main__':
    test_bazi = {
        "year": {"gan": "甲", "zhi": "子"},
        "month": {"gan": "丙", "zhi": "寅"},
        "day": {"gan": "戊", "zhi": "辰"},
        "time": {"gan": "癸", "zhi": "丑"}
    }
    # 流月丙午
    ly_zhi = "午"
    
    result = get_monthly_favorable_element(test_bazi, ly_zhi)
    import json
    print("=== 测试结果 ===")
    print(json.dumps(result, ensure_ascii=False, indent=2))

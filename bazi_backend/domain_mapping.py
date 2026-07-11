from config import GAN_TO_WUXING, WUXING_SHENG, WUXING_KE, WEAK_DOMAIN_THRESHOLD_RATIO

# 步骤B：十神类别 -> 生活领域映射表
DOMAIN_MAPPING_MALE = {
    '比劫': '人际关系、合伙',
    '食伤': '才华灵感',
    '财才': '感情与桃花',
    '官杀': '事业',
    '印枭': '健康与贵人运'
}

DOMAIN_MAPPING_FEMALE = {
    '比劫': '人际关系、合伙',
    '食伤': '才华灵感',
    '财才': '事业',
    '官杀': '感情与桃花',
    '印枭': '健康与贵人运'
}

def get_shishen_to_wuxing(dm_wuxing):
    """
    步骤A：根据日主五行，推导出十神类别对应的五行（简化版，不分阴阳）
    """
    shishen_wx = {}
    
    # 比劫（同我）
    shishen_wx['比劫'] = dm_wuxing
    
    # 食伤（我生）
    shishen_wx['食伤'] = WUXING_SHENG[dm_wuxing]
    
    # 财才（我克）
    shishen_wx['财才'] = WUXING_KE[dm_wuxing]
    
    # 官杀（克我）
    for k, v in WUXING_KE.items():
        if v == dm_wuxing:
            shishen_wx['官杀'] = k
            break
            
    # 印枭（生我）
    for k, v in WUXING_SHENG.items():
        if v == dm_wuxing:
            shishen_wx['印枭'] = k
            break
            
    return shishen_wx

def calculate_domain_scores(dm_wuxing, final_score, gender):
    """
    步骤C：计算每个领域的当月得分
    """
    shishen_to_wx = get_shishen_to_wuxing(dm_wuxing)
    mapping = DOMAIN_MAPPING_MALE if gender == 'male' else DOMAIN_MAPPING_FEMALE
    
    domain_scores = {}
    for shishen, domain in mapping.items():
        wx = shishen_to_wx[shishen]
        domain_scores[domain] = final_score[wx]
        
    return domain_scores

def determine_weakest_domains(domain_scores):
    """
    步骤D：判断当月最弱的领域
    找出得分最低的1-2个领域
    """
    # 按分数从低到高排序
    sorted_domains = sorted(domain_scores.items(), key=lambda x: x[1])
    
    lowest_domain, lowest_score = sorted_domains[0]
    second_lowest_domain, second_lowest_score = sorted_domains[1]
    
    # 为了避免负数相加相互抵消导致总分为0或极小，取绝对值之和作为总刻度
    total_score_abs = sum(abs(v) for v in domain_scores.values())
    if total_score_abs == 0:
        total_score_abs = 1  # 防止除以0
        
    gap = second_lowest_score - lowest_score
    threshold = total_score_abs * WEAK_DOMAIN_THRESHOLD_RATIO
    
    if gap <= threshold:
        return [lowest_domain, second_lowest_domain]
    else:
        return [lowest_domain]

def get_monthly_weak_domain(day_master: str, final_score: dict, gender: str) -> dict:
    """
    步骤E：最终输出结构（主接口）
    """
    dm_wuxing = GAN_TO_WUXING.get(day_master)
    if not dm_wuxing:
        raise ValueError(f"无效的日主天干: {day_master}")
        
    domain_scores = calculate_domain_scores(dm_wuxing, final_score, gender)
    weak_domains = determine_weakest_domains(domain_scores)
    
    return {
        "domain_scores": domain_scores,
        "weak_domains": weak_domains
    }

# 简单测试入口
if __name__ == '__main__':
    import json
    
    # 测试数据：假设日主为甲(木)
    day_master = "甲"
    # 假设一个当月动态分+静态分的最终结果
    final_score = {
        "金": 2.5,   # 官杀
        "木": 5.0,   # 比劫
        "水": -1.0,  # 印枭
        "火": 4.0,   # 食伤
        "土": 2.6    # 财才
    }
    
    print("=== 测试 男命 ===")
    result_male = get_monthly_weak_domain(day_master, final_score, 'male')
    print(json.dumps(result_male, ensure_ascii=False, indent=2))
    
    print("\n=== 测试 女命 ===")
    result_female = get_monthly_weak_domain(day_master, final_score, 'female')
    print(json.dumps(result_female, ensure_ascii=False, indent=2))

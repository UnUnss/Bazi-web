// config & tables
const GAN_TO_WUXING = {
    '甲': '木', '乙': '木',
    '丙': '火', '丁': '火',
    '戊': '土', '己': '土',
    '庚': '金', '辛': '金',
    '壬': '水', '癸': '水'
};

const WUXING_SHENG = {
    '木': '火', '火': '土', '土': '金', '金': '水', '水': '木'
};

const WUXING_KE = {
    '木': '土', '土': '水', '水': '火', '火': '金', '金': '木'
};

const WEIGHT_BEN_QI = 0.6;
const WEIGHT_ZHONG_QI = 0.3;
const WEIGHT_YU_QI = 0.1;
const WEIGHT_TIANGAN = 1.0;
const MONTH_COMMAND_MULTIPLIER = 1.5;
const STATIC_FAVORABLE_BASE_SCORE = 5;

const SCORE_LIUCHONG = -2;
const SCORE_LIUHE_BASE = 1;
const SCORE_LIUHE_EXTRA = 1;
const SCORE_SANHE_FULL = 3;
const SCORE_SANHE_HALF = 1.5;
const SCORE_SANHUI_FULL = 3;
const SCORE_SANHUI_HALF = 1.5;
const SCORE_XING = -1;
const SCORE_HAI = -1;

const CANGGAN_TABLE = {
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
};

// helpers for sets
function isSubset(subset, superset) {
    for (let elem of subset) {
        if (!superset.has(elem)) return false;
    }
    return true;
}
function setEquals(a, b) {
    return a.size === b.size && isSubset(a, b);
}

// relations
const LIU_CHONG = [
    new Set(['子', '午']), new Set(['丑', '未']), new Set(['寅', '申']), 
    new Set(['卯', '酉']), new Set(['辰', '戌']), new Set(['巳', '亥'])
];

const LIU_HE = [
    { set: new Set(['子', '丑']), out: '土' },
    { set: new Set(['寅', '亥']), out: '木' },
    { set: new Set(['卯', '戌']), out: '火' },
    { set: new Set(['辰', '酉']), out: '金' },
    { set: new Set(['巳', '申']), out: '水' },
    { set: new Set(['午', '未']), out: '土' }
];

const SAN_HE = [
    { set: new Set(['申', '子', '辰']), out: '水' },
    { set: new Set(['亥', '卯', '未']), out: '木' },
    { set: new Set(['寅', '午', '戌']), out: '火' },
    { set: new Set(['巳', '酉', '丑']), out: '金' }
];

function get_ban_san_he(b1, b2) {
    const pair = new Set([b1, b2]);
    for (let combo of SAN_HE) {
        if (isSubset(pair, combo.set)) return combo.out;
    }
    return null;
}

const SAN_HUI = [
    { set: new Set(['寅', '卯', '辰']), out: '木' },
    { set: new Set(['巳', '午', '未']), out: '火' },
    { set: new Set(['申', '酉', '戌']), out: '金' },
    { set: new Set(['亥', '子', '丑']), out: '水' }
];

function get_ban_san_hui(b1, b2) {
    const pair = new Set([b1, b2]);
    for (let combo of SAN_HUI) {
        if (isSubset(pair, combo.set)) return combo.out;
    }
    return null;
}

const XIANG_XING = [
    new Set(['寅', '巳']), new Set(['巳', '申']), new Set(['寅', '申']),
    new Set(['丑', '戌']), new Set(['戌', '未']), new Set(['丑', '未']),
    new Set(['子', '卯'])
];
const ZI_XING = new Set(['辰', '午', '酉', '亥']);

const LIU_HAI = [
    new Set(['子', '未']), new Set(['丑', '午']), new Set(['寅', '巳']),
    new Set(['卯', '辰']), new Set(['申', '亥']), new Set(['酉', '戌'])
];

function get_base_element_scores(bazi) {
    const scores = {'金': 0.0, '木': 0.0, '水': 0.0, '火': 0.0, '土': 0.0};
    const pillars = ['year', 'month', 'day', 'time'];
    
    for (let p of pillars) {
        if (!bazi[p]) continue;
        
        const gan = bazi[p].gan;
        if (GAN_TO_WUXING[gan]) scores[GAN_TO_WUXING[gan]] += WEIGHT_TIANGAN;
        
        const zhi = bazi[p].zhi;
        const canggan = CANGGAN_TABLE[zhi] || {};
        for (let c_gan in canggan) {
            const wuxing = GAN_TO_WUXING[c_gan];
            if (wuxing) scores[wuxing] += canggan[c_gan];
        }
    }
    return scores;
}

function determine_strength(bazi) {
    const scores = get_base_element_scores(bazi);
    const day_master = bazi['day'].gan;
    const dm_wuxing = GAN_TO_WUXING[day_master];
    
    let yin_wuxing = null;
    for (let k in WUXING_SHENG) {
        if (WUXING_SHENG[k] === dm_wuxing) {
            yin_wuxing = k;
            break;
        }
    }
    
    let tong_lei_score = scores[dm_wuxing] + (yin_wuxing ? scores[yin_wuxing] : 0);
    
    let total = Object.values(scores).reduce((a, b) => a + b, 0);
    let yi_lei_score = total - tong_lei_score;
    
    const month_zhi = bazi['month'].zhi;
    const month_canggan = CANGGAN_TABLE[month_zhi];
    if (month_canggan) {
        let maxW = -1;
        let ben_qi = null;
        for (let k in month_canggan) {
            if (month_canggan[k] > maxW) {
                maxW = month_canggan[k];
                ben_qi = k;
            }
        }
        const ben_qi_wuxing = GAN_TO_WUXING[ben_qi];
        if (ben_qi_wuxing === dm_wuxing || ben_qi_wuxing === yin_wuxing) {
            tong_lei_score *= MONTH_COMMAND_MULTIPLIER;
        }
    }
    
    const is_strong = tong_lei_score > yi_lei_score;
    return { is_strong, dm_wuxing, yin_wuxing };
}

function get_static_favorable(bazi) {
    const str = determine_strength(bazi);
    const dm_wuxing = str.dm_wuxing;
    const yin_wuxing = str.yin_wuxing;
    
    const cai_wuxing = WUXING_KE[dm_wuxing];
    const shishang_wuxing = WUXING_SHENG[dm_wuxing];
    let guansha_wuxing = null;
    for (let k in WUXING_KE) {
        if (WUXING_KE[k] === dm_wuxing) {
            guansha_wuxing = k;
            break;
        }
    }
    
    let favorable, avoid, status;
    if (str.is_strong) {
        favorable = [cai_wuxing, guansha_wuxing, shishang_wuxing].filter(Boolean);
        avoid = [yin_wuxing, dm_wuxing].filter(Boolean);
        status = "身强";
    } else {
        favorable = [yin_wuxing, dm_wuxing].filter(Boolean);
        avoid = [cai_wuxing, guansha_wuxing, shishang_wuxing].filter(Boolean);
        status = "身弱";
    }
    return { favorable, avoid, status };
}

function get_zhi_main_wuxing(zhi) {
    const canggan = CANGGAN_TABLE[zhi];
    if (!canggan) return null;
    let maxW = -1, ben_qi = null;
    for (let k in canggan) {
        if (canggan[k] > maxW) { maxW = canggan[k]; ben_qi = k; }
    }
    return GAN_TO_WUXING[ben_qi];
}

const WEAK_DOMAIN_THRESHOLD_RATIO = 0.1;
// 忌神在无任何合冲刑害时的基础弱势惩罚，使其在平静月份仍偏弱
// 但当喜用五行被冲/刑/害时（动态得分为负），该喜用域也可能临时出现在弱势列表
const AVOID_BASE_WEAKNESS = 2;

// 步骤B：十神类别 -> 生活领域映射表
const DOMAIN_MAPPING_MALE = {
    '比劫': '人际关系、合伙',
    '食伤': '才华灵感',
    '财才': '感情与桃花',
    '官杀': '事业',
    '印枭': '健康与贵人运'
};

const DOMAIN_MAPPING_FEMALE = {
    '比劫': '人际关系、合伙',
    '食伤': '才华灵感',
    '财才': '事业',
    '官杀': '感情与桃花',
    '印枭': '健康与贵人运'
};

function get_monthly_weak_domain(day_master, final_score, gender) {
    const dm_wuxing = GAN_TO_WUXING[day_master];
    const shishen_wx = {};
    shishen_wx['比劫'] = dm_wuxing;
    shishen_wx['食伤'] = WUXING_SHENG[dm_wuxing];
    shishen_wx['财才'] = WUXING_KE[dm_wuxing];
    for (let k in WUXING_KE) {
        if (WUXING_KE[k] === dm_wuxing) { shishen_wx['官杀'] = k; break; }
    }
    for (let k in WUXING_SHENG) {
        if (WUXING_SHENG[k] === dm_wuxing) { shishen_wx['印枭'] = k; break; }
    }
    
    const mapping = (gender === 1 || gender === '1' || gender === 'male') ? DOMAIN_MAPPING_MALE : DOMAIN_MAPPING_FEMALE;
    const domain_scores = {};
    for (let shishen in mapping) {
        let wx = shishen_wx[shishen];
        domain_scores[mapping[shishen]] = final_score[wx];
    }
    
    const sorted_domains = Object.keys(domain_scores).sort((a, b) => domain_scores[a] - domain_scores[b]);
    const lowest_domain = sorted_domains[0];
    const second_lowest_domain = sorted_domains[1];
    const lowest_score = domain_scores[lowest_domain];
    const second_lowest_score = domain_scores[second_lowest_domain];
    
    let total_score_abs = 0;
    for (let k in domain_scores) { total_score_abs += Math.abs(domain_scores[k]); }
    if (total_score_abs === 0) total_score_abs = 1;
    
    const gap = second_lowest_score - lowest_score;
    const threshold = total_score_abs * WEAK_DOMAIN_THRESHOLD_RATIO;
    
    if (gap <= threshold) {
        return [lowest_domain, second_lowest_domain];
    } else {
        return [lowest_domain];
    }
}

function get_monthly_favorable_element(bazi, liuyue_zhi, gender) {
    const statics = get_static_favorable(bazi);
    const static_fav = statics.favorable;
    
    const dynamic_scores = {'金': 0.0, '木': 0.0, '水': 0.0, '火': 0.0, '土': 0.0};
    const yuanju_zhis = [bazi.year.zhi, bazi.month.zhi, bazi.day.zhi, bazi.time.zhi];
    
    const ly_main_wx = get_zhi_main_wuxing(liuyue_zhi);
    
    for (let yz of yuanju_zhis) {
        const pair = new Set([liuyue_zhi, yz]);
        const yz_main_wx = get_zhi_main_wuxing(yz);
        
        // 六冲
        for (let chong of LIU_CHONG) {
            if (setEquals(pair, chong) && yz_main_wx) dynamic_scores[yz_main_wx] += SCORE_LIUCHONG;
        }
        
        // 六合
        for (let he of LIU_HE) {
            if (setEquals(pair, he.set)) {
                if (ly_main_wx) dynamic_scores[ly_main_wx] += SCORE_LIUHE_BASE;
                if (yz_main_wx) dynamic_scores[yz_main_wx] += SCORE_LIUHE_BASE;
                if (static_fav.includes(he.out)) dynamic_scores[he.out] += SCORE_LIUHE_EXTRA;
            }
        }
        
        // 相刑
        let isXing = false;
        for (let xing of XIANG_XING) {
            if (setEquals(pair, xing)) isXing = true;
        }
        if (liuyue_zhi === yz && ZI_XING.has(liuyue_zhi)) isXing = true;
        if (isXing) {
            if (ly_main_wx) dynamic_scores[ly_main_wx] += SCORE_XING;
            if (yz_main_wx) dynamic_scores[yz_main_wx] += SCORE_XING;
        }
        
        // 六害
        for (let hai of LIU_HAI) {
            if (setEquals(pair, hai)) {
                if (ly_main_wx) dynamic_scores[ly_main_wx] += SCORE_HAI;
                if (yz_main_wx) dynamic_scores[yz_main_wx] += SCORE_HAI;
            }
        }
    }
    
    // 三合 / 三会
    const yuanju_pairs = [];
    for (let i = 0; i < yuanju_zhis.length; i++) {
        for (let j = i + 1; j < yuanju_zhis.length; j++) {
            yuanju_pairs.push([yuanju_zhis[i], yuanju_zhis[j]]);
        }
    }
    
    let found_full_combo = false;
    for (let p of yuanju_pairs) {
        const trio = new Set([liuyue_zhi, p[0], p[1]]);
        
        for (let he of SAN_HE) {
            if (setEquals(trio, he.set)) { dynamic_scores[he.out] += SCORE_SANHE_FULL; found_full_combo = true; }
        }
        for (let hui of SAN_HUI) {
            if (setEquals(trio, hui.set)) { dynamic_scores[hui.out] += SCORE_SANHUI_FULL; found_full_combo = true; }
        }
    }
    
    if (!found_full_combo) {
        for (let yz of yuanju_zhis) {
            const banhe = get_ban_san_he(liuyue_zhi, yz);
            if (banhe) dynamic_scores[banhe] += SCORE_SANHE_HALF;
            
            const banhui = get_ban_san_hui(liuyue_zhi, yz);
            if (banhui) dynamic_scores[banhui] += SCORE_SANHUI_HALF;
        }
    }
    
    const final_score = {...dynamic_scores};
    for (let wx of static_fav) {
        final_score[wx] += STATIC_FAVORABLE_BASE_SCORE;
    }
    
    let highest_wx = null, maxScore = -999;
    for (let k in final_score) {
        if (final_score[k] > maxScore) { maxScore = final_score[k]; highest_wx = k; }
    }
    
    // 弱势领域用专门的弱势评分：忌神有基础惩罚，动态月份互动（冲/刑/害）会进一步降分
    // 分数越低 = 该领域越弱。这样避免被静态喜用加成(+5)掩盖月份间的差异。
    const weakness_score = {};
    for (let wx in dynamic_scores) {
        const avoid_penalty = statics.avoid.includes(wx) ? AVOID_BASE_WEAKNESS : 0;
        weakness_score[wx] = dynamic_scores[wx] - avoid_penalty;
    }
    const weak_domains = get_monthly_weak_domain(bazi.day.gan, weakness_score, gender);
    
    return {
        favorable_element: highest_wx,
        score: maxScore,
        shen_qiang_ruo: statics.status,
        weak_domains: weak_domains
    };
}

// bazi_logic.js  ── 六层动态喜用神算法
// 参考规格：原局定基调 → 效用系数 → 环境乘数 → 组合触发 → 矛盾检测 → 输出
// ============================================================

// ── 基础五行映射 ──────────────────────────────────────────────
const GAN_TO_WUXING = {
    '甲':'木','乙':'木','丙':'火','丁':'火','戊':'土',
    '己':'土','庚':'金','辛':'金','壬':'水','癸':'水'
};
const WUXING_SHENG = {'木':'火','火':'土','土':'金','金':'水','水':'木'};
const WUXING_KE    = {'木':'土','土':'水','水':'火','火':'金','金':'木'};
const WUXING_LIST  = ['金','木','水','火','土'];

// ── 藏干权重 ─────────────────────────────────────────────────
const WEIGHT_BEN_QI   = 0.6;
const WEIGHT_ZHONG_QI = 0.3;
const WEIGHT_YU_QI    = 0.1;

const CANGGAN_TABLE = {
    '子':{'癸':WEIGHT_BEN_QI},
    '丑':{'己':WEIGHT_BEN_QI,'辛':WEIGHT_ZHONG_QI,'癸':WEIGHT_YU_QI},
    '寅':{'甲':WEIGHT_BEN_QI,'丙':WEIGHT_ZHONG_QI,'戊':WEIGHT_YU_QI},
    '卯':{'乙':WEIGHT_BEN_QI},
    '辰':{'戊':WEIGHT_BEN_QI,'癸':WEIGHT_ZHONG_QI,'乙':WEIGHT_YU_QI},
    '巳':{'丙':WEIGHT_BEN_QI,'庚':WEIGHT_ZHONG_QI,'戊':WEIGHT_YU_QI},
    '午':{'丁':WEIGHT_BEN_QI,'己':WEIGHT_ZHONG_QI},
    '未':{'己':WEIGHT_BEN_QI,'乙':WEIGHT_ZHONG_QI,'丁':WEIGHT_YU_QI},
    '申':{'庚':WEIGHT_BEN_QI,'壬':WEIGHT_ZHONG_QI,'戊':WEIGHT_YU_QI},
    '酉':{'辛':WEIGHT_BEN_QI},
    '戌':{'戊':WEIGHT_BEN_QI,'丁':WEIGHT_ZHONG_QI,'辛':WEIGHT_YU_QI},
    '亥':{'壬':WEIGHT_BEN_QI,'甲':WEIGHT_ZHONG_QI}
};

// ── 十二长生表（阴阳干各自）────────────────────────────────
const CHANG_SHENG_TABLE = {
    '甲':{'亥':'长生','子':'沐浴','丑':'冠带','寅':'临官','卯':'帝旺',
          '辰':'衰',  '巳':'病',  '午':'死',  '未':'墓',  '申':'绝',  '酉':'胎','戌':'养'},
    '乙':{'午':'长生','巳':'沐浴','辰':'冠带','卯':'临官','寅':'帝旺',
          '丑':'衰',  '子':'病',  '亥':'死',  '戌':'墓',  '酉':'绝',  '申':'胎','未':'养'},
    '丙':{'寅':'长生','卯':'沐浴','辰':'冠带','巳':'临官','午':'帝旺',
          '未':'衰',  '申':'病',  '酉':'死',  '戌':'墓',  '亥':'绝',  '子':'胎','丑':'养'},
    '丁':{'酉':'长生','申':'沐浴','未':'冠带','午':'临官','巳':'帝旺',
          '辰':'衰',  '卯':'病',  '寅':'死',  '丑':'墓',  '子':'绝',  '亥':'胎','戌':'养'},
    '戊':{'寅':'长生','卯':'沐浴','辰':'冠带','巳':'临官','午':'帝旺',
          '未':'衰',  '申':'病',  '酉':'死',  '戌':'墓',  '亥':'绝',  '子':'胎','丑':'养'},
    '己':{'酉':'长生','申':'沐浴','未':'冠带','午':'临官','巳':'帝旺',
          '辰':'衰',  '卯':'病',  '寅':'死',  '丑':'墓',  '子':'绝',  '亥':'胎','戌':'养'},
    '庚':{'巳':'长生','午':'沐浴','未':'冠带','申':'临官','酉':'帝旺',
          '戌':'衰',  '亥':'病',  '子':'死',  '丑':'墓',  '寅':'绝',  '卯':'胎','辰':'养'},
    '辛':{'子':'长生','亥':'沐浴','戌':'冠带','酉':'临官','申':'帝旺',
          '未':'衰',  '午':'病',  '巳':'死',  '辰':'墓',  '卯':'绝',  '寅':'胎','丑':'养'},
    '壬':{'申':'长生','酉':'沐浴','戌':'冠带','亥':'临官','子':'帝旺',
          '丑':'衰',  '寅':'病',  '卯':'死',  '辰':'墓',  '巳':'绝',  '午':'胎','未':'养'},
    '癸':{'卯':'长生','寅':'沐浴','丑':'冠带','子':'临官','亥':'帝旺',
          '戌':'衰',  '酉':'病',  '申':'死',  '未':'墓',  '午':'绝',  '巳':'胎','辰':'养'}
};

// 月令得分（日主在月令的十二长生档位 → 月令基础分）
const YUELING_SCORE = {
    '临官':40, '帝旺':40,
    '长生':20, '冠带':20, '墓':20,
    '衰':0, '病':0, '死':0, '绝':0, '沐浴':0, '胎':0, '养':0
};

// 通根得分（日主在各支的十二长生档位 → 通根加分）
const TONG_GEN_SCORE = {
    '临官':15, '帝旺':15,
    '长生':8,  '冠带':8,  '墓':8,
    '衰':0, '病':0, '死':0, '绝':0, '沐浴':0, '胎':0, '养':0
};

// 透干加分（见比劫或印星每个+10）
const TOUGAN_SCORE = 10;

// ── 四级效用系数表 ───────────────────────────────────────────
// bj=比劫, yx=印星, ss=食伤, cc=财才, gs=官杀
const SHISHEN_COEFF = {
    '身强':     { bj:-0.8, yx:-0.7, ss:+0.8, cc:+0.9, gs:+0.7 },
    '身弱':     { bj:+0.8, yx:+0.9, ss:-0.6, cc:-0.7, gs:-0.8 },
    '中和偏弱': { bj:+0.3, yx:+0.5, ss:+0.2, cc:-0.2, gs:-0.3 },
    '中和偏强': { bj:-0.3, yx:-0.2, ss:+0.3, cc:+0.4, gs:+0.2 },
    // 极旺/极弱：从格/专旺确认后反转喜忌（顺势而行，与身强/身弱相反）
    '极旺':     { bj:+0.9, yx:+0.8, ss:-0.7, cc:-0.8, gs:-0.9 },  // 从旺：印比为喜，泄耗克为忌
    '极弱':     { bj:-0.7, yx:-0.8, ss:+0.8, cc:+0.9, gs:+0.7 }   // 从弱：泄耗克为喜，印比为忌
};

// ── 调候表（按流月地支判断寒暖失衡程度与调候用神）─────────
const TIAHOU_TABLE = {
    '子':{ need:'火', urgency:0.5 }, '丑':{ need:'火', urgency:0.4 },
    '亥':{ need:'火', urgency:0.4 }, '寅':{ need:'火', urgency:0.2 },
    '午':{ need:'水', urgency:0.5 }, '未':{ need:'水', urgency:0.4 },
    '巳':{ need:'水', urgency:0.3 }, '申':{ need:'水', urgency:0.2 },
    '戌':{ need:'水', urgency:0.2 },
    '卯':{ need:null, urgency:0   }, '辰':{ need:null, urgency:0   },
    '酉':{ need:null, urgency:0   }
};

// ── 墓库对照 ─────────────────────────────────────────────────
const MU_KU = { '水':'辰', '木':'未', '火':'戌', '金':'丑' };

// ── 地支关系表 ──────────────────────────────────────────────
const LIU_CHONG = [
    new Set(['子','午']), new Set(['丑','未']), new Set(['寅','申']),
    new Set(['卯','酉']), new Set(['辰','戌']), new Set(['巳','亥'])
];
const LIU_HE = [
    { set:new Set(['子','丑']), out:'土' }, { set:new Set(['寅','亥']), out:'木' },
    { set:new Set(['卯','戌']), out:'火' }, { set:new Set(['辰','酉']), out:'金' },
    { set:new Set(['巳','申']), out:'水' }, { set:new Set(['午','未']), out:'土' }
];
const SAN_HE = [
    { set:new Set(['申','子','辰']), out:'水' }, { set:new Set(['亥','卯','未']), out:'木' },
    { set:new Set(['寅','午','戌']), out:'火' }, { set:new Set(['巳','酉','丑']), out:'金' }
];
const SAN_HUI = [
    { set:new Set(['寅','卯','辰']), out:'木' }, { set:new Set(['巳','午','未']), out:'火' },
    { set:new Set(['申','酉','戌']), out:'金' }, { set:new Set(['亥','子','丑']), out:'水' }
];
const XIANG_XING = [
    new Set(['寅','巳']), new Set(['巳','申']), new Set(['寅','申']),
    new Set(['丑','戌']), new Set(['戌','未']), new Set(['丑','未']),
    new Set(['子','卯'])
];
const ZI_XING   = new Set(['辰','午','酉','亥']);
const LIU_HAI   = [
    new Set(['子','未']), new Set(['丑','午']), new Set(['寅','巳']),
    new Set(['卯','辰']), new Set(['申','亥']), new Set(['酉','戌'])
];

// 天克映射：GAN_KE_MAP[a] = 被 a 克的天干列表
const GAN_KE_MAP = {
    '甲':['戊','己'], '乙':['戊','己'],
    '丙':['庚','辛'], '丁':['庚','辛'],
    '戊':['壬','癸'], '己':['壬','癸'],
    '庚':['甲','乙'], '辛':['甲','乙'],
    '壬':['丙','丁'], '癸':['丙','丁']
};

// ── 生活域映射（男女有别；同一十神可对应多个展示名）────────
// 计分/选出仍按十神一条；展示时用 DOMAIN_DISPLAY_NAMES 拆开名字
const DOMAIN_MAPPING_MALE = {
    '比劫':'人际关系、合伙',
    '食伤':'才华灵感',
    '财才':'财富与感情',       // 财富运 + 感情运（同十神，名字分开展示）
    '官杀':'事业',
    '印枭':'健康与贵人运'      // 健康运 + 贵人运
};
const DOMAIN_MAPPING_FEMALE = {
    '比劫':'人际关系、合伙',
    '食伤':'才华灵感',
    '财才':'财富与事业',       // 财富运 + 事业运
    '官杀':'感情与桃花',
    '印枭':'健康与贵人运'
};

// 领域 key → 展示短名列表（简体；UI 层可再做 i18n）
const DOMAIN_DISPLAY_NAMES = {
    '人际关系、合伙': ['人缘运'],
    '才华灵感':       ['才华运'],
    '财富与感情':     ['财富运', '感情运'],
    '财富与事业':     ['财富运', '事业运'],
    '事业':           ['事业运'],
    '感情与桃花':     ['感情运'],
    '健康与贵人运':   ['健康运', '贵人运']
};

function expand_domain_display_names(domainKey) {
    return DOMAIN_DISPLAY_NAMES[domainKey] || [domainKey];
}

// 作图最多支持两个运名：十神展开后去重，超过 2 个则按种子稳定随机抽 2 个
function hash_seed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function pick_two_yun_names(domainKeys, seedStr) {
    const pool = [];
    for (let key of domainKeys) {
        for (let name of expand_domain_display_names(key)) {
            if (pool.indexOf(name) < 0) pool.push(name);
        }
    }
    if (pool.length === 0) return ['人缘运', '健康运'];
    if (pool.length === 1) return [pool[0], pool[0]];
    if (pool.length === 2) return [pool[0], pool[1]];

    // 稳定洗牌后取前 2（同月同命局结果固定，刷新不跳变）
    const arr = pool.slice();
    let s = hash_seed(seedStr || arr.join('|'));
    for (let i = arr.length - 1; i > 0; i--) {
        s = (Math.imul(s, 1103515245) + 12345) >>> 0;
        const j = s % (i + 1);
        const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return [arr[0], arr[1]];
}

// ============================================================
// 工具函数
// ============================================================

function isSubset(sub, sup) {
    for (let e of sub) if (!sup.has(e)) return false;
    return true;
}
function setEquals(a, b) { return a.size === b.size && isSubset(a, b); }

function get_zhi_main_wuxing(zhi) {
    const cg = CANGGAN_TABLE[zhi];
    if (!cg) return null;
    let maxW = -1, bg = null;
    for (let k in cg) { if (cg[k] > maxW) { maxW = cg[k]; bg = k; } }
    return GAN_TO_WUXING[bg];
}

function get_chang_sheng(gan, zhi) {
    return (CHANG_SHENG_TABLE[gan] || {})[zhi] || null;
}

function is_liu_chong(z1, z2) {
    const p = new Set([z1, z2]);
    return LIU_CHONG.some(s => setEquals(p, s));
}

function is_gan_ke(a, b) {
    return (GAN_KE_MAP[a] || []).includes(b);
}

function get_ban_san_he(b1, b2) {
    if (b1 === b2) return null;  // 同支自比对：Set去重后isSubset天然成立，是虚假半合
    const p = new Set([b1, b2]);
    for (let c of SAN_HE)  if (isSubset(p, c.set)) return c.out;
    return null;
}
function get_ban_san_hui(b1, b2) {
    if (b1 === b2) return null;  // 同支自比对：同上
    const p = new Set([b1, b2]);
    for (let c of SAN_HUI) if (isSubset(p, c.set)) return c.out;
    return null;
}

// 原局五行基础分（用于Layer2覆盖规则检测）
function get_base_element_scores(bazi) {
    const s = { 金:0, 木:0, 水:0, 火:0, 土:0 };
    for (let p of ['year','month','day','time']) {
        if (!bazi[p]) continue;
        const gw = GAN_TO_WUXING[bazi[p].gan];
        if (gw) s[gw] += 1.0;
        const cg = CANGGAN_TABLE[bazi[p].zhi] || {};
        for (let g in cg) { const wx = GAN_TO_WUXING[g]; if (wx) s[wx] += cg[g]; }
    }
    return s;
}

// ============================================================
// Layer 1：日主旺衰积分（十二长生体系）
// ============================================================
function determine_strength_v2(bazi) {
    const dm_gan     = bazi.day.gan;
    const dm_wuxing  = GAN_TO_WUXING[dm_gan];

    // 印星（生日主的五行）
    let yin_wuxing = null;
    for (let k in WUXING_SHENG) {
        if (WUXING_SHENG[k] === dm_wuxing) { yin_wuxing = k; break; }
    }

    let score = 0;

    // 月令得分（最高权重）
    // 禄/刃月：日干在月令十二长生为临官/帝旺 → +40
    // 印月/比劫月：月令本气五行为印星或比劫 → +40（十二长生在此可能显示为衰，需额外补检）
    // 相地：长生/冠带/墓 → +20
    // 休囚死绝：0
    const month_stage = get_chang_sheng(dm_gan, bazi.month.zhi);
    let yueling = YUELING_SCORE[month_stage] || 0;
    if (yueling === 0) {
        const month_main_wx = get_zhi_main_wuxing(bazi.month.zhi);
        if (month_main_wx === dm_wuxing || month_main_wx === yin_wuxing) {
            yueling = 40;  // 印月或比劫当令
        }
    }
    score += yueling;

    // 通根（年、日、时支；月支已在"月令得分"里单独计权，此处排除避免双重计分）
    // 问题4修复：旧代码 ['year','month','day','time'] 导致月支最高贡献 40(月令)+15(通根)=55分
    for (let p of ['year','day','time']) {
        if (!bazi[p]) continue;
        const stage = get_chang_sheng(dm_gan, bazi[p].zhi);
        score += TONG_GEN_SCORE[stage] || 0;
    }

    // 透干（年月时天干，不含日干本身）
    for (let p of ['year','month','time']) {
        if (!bazi[p]) continue;
        const wx = GAN_TO_WUXING[bazi[p].gan];
        if (wx === dm_wuxing || wx === yin_wuxing) score += TOUGAN_SCORE;
    }

    // 极旺/极弱需通过从格确认；未确认则降级为身强/身弱（避免仅凭分数误反转喜忌）
    let status;
    if (score >= 90) {
        status = confirm_cong_ge(score, dm_wuxing, yin_wuxing, bazi) ? '极旺' : '身强';
    } else if (score <= 10) {
        status = confirm_cong_ge(score, dm_wuxing, yin_wuxing, bazi) ? '极弱' : '身弱';
    } else if (score >= 60) status = '身强';
    else if (score >= 50) status = '中和偏强';
    else if (score >= 40) status = '中和偏弱';
    else                  status = '身弱';

    return { score, status, dm_gan, dm_wuxing, yin_wuxing };
}

// 从格/专旺确认：分数触线后，再看原局五行存量是否支持"顺势"
// 极旺（从旺）：印比合计 ≥ 总量55%，且官杀不重（<1.5）
// 极弱（从弱）：印比合计 < 总量30%，且日主地支通根极弱
//   （日干本身恒贡献1.0，故通根 = raw[日主] - 1.0，不含日干自身）
function confirm_cong_ge(score, dm_wuxing, yin_wuxing, bazi) {
    const raw = get_base_element_scores(bazi);
    let total = 0;
    for (let wx of WUXING_LIST) total += (raw[wx] || 0);
    if (total <= 0) return false;

    const self = (raw[dm_wuxing] || 0) + (yin_wuxing ? (raw[yin_wuxing] || 0) : 0);
    // 找官杀五行（克日主者）
    let gs_wx = null;
    for (let k in WUXING_KE) {
        if (WUXING_KE[k] === dm_wuxing) { gs_wx = k; break; }
    }

    if (score >= 90) {
        return self >= total * 0.55 && (gs_wx ? (raw[gs_wx] || 0) < 1.5 : true);
    }
    if (score <= 10) {
        const dm_roots = Math.max(0, (raw[dm_wuxing] || 0) - 1.0); // 去掉日干自身
        return self < total * 0.30 && dm_roots < 0.5;
    }
    return false;
}

// ============================================================
// Layer 2：五行效用系数表（含三条覆盖规则）
// ============================================================
function get_shishen_type(wx, dm_wuxing, yin_wuxing) {
    if (wx === dm_wuxing)               return 'bj';  // 比劫
    if (wx === yin_wuxing)              return 'yx';  // 印星
    if (WUXING_SHENG[dm_wuxing] === wx) return 'ss';  // 食伤
    if (WUXING_KE[dm_wuxing]    === wx) return 'cc';  // 财才
    return 'gs';                                       // 官杀
}

function build_coefficients(str, orig_month_zhi, bazi_raw) {
    const { status, dm_wuxing, yin_wuxing } = str;
    const row = SHISHEN_COEFF[status] || SHISHEN_COEFF['身弱'];

    const coeffs = {};
    for (let wx of WUXING_LIST) {
        coeffs[wx] = row[get_shishen_type(wx, dm_wuxing, yin_wuxing)];
    }

    // 覆盖规则1：调候优先（原局月令寒暖失衡时，调候用神系数提升）
    const tiahou = TIAHOU_TABLE[orig_month_zhi];
    if (tiahou && tiahou.need && tiahou.urgency >= 0.2) {
        const wx  = tiahou.need;
        // 原局若已有足够调候元素，则减弱紧迫度
        const existing = bazi_raw[wx] || 0;
        const adj = Math.max(0, tiahou.urgency - existing * 0.02);
        if (adj > 0.05 && coeffs[wx] < 0.5) {
            coeffs[wx] = Math.max(coeffs[wx], 0.5 + adj * 0.2);
        }
    }

    // 覆盖规则2：通关优先（原局两行对峙 → 通关五行系数强制≥+1.0）
    const ke_pairs = [['木','土'],['土','水'],['水','火'],['火','金'],['金','木']];
    for (let [atk, tgt] of ke_pairs) {
        if ((bazi_raw[atk] || 0) >= 1.5 && (bazi_raw[tgt] || 0) >= 1.5) {
            const tg = WUXING_SHENG[atk];  // 泄攻击方的五行
            if (tg) coeffs[tg] = Math.max(coeffs[tg], 1.0);
        }
    }

    // 覆盖规则3：病药修正（某五行极旺成"病"→ 克它的五行额外+0.3）
    let maxWx = null, maxRaw = 0;
    for (let wx of WUXING_LIST) {
        if ((bazi_raw[wx] || 0) > maxRaw) { maxRaw = bazi_raw[wx]; maxWx = wx; }
    }
    if (maxWx && maxRaw >= 2.0) {
        for (let k in WUXING_KE) {
            if (WUXING_KE[k] === maxWx) {
                coeffs[k] = Math.min(1.0, coeffs[k] + 0.3);
                break;
            }
        }
    }

    return coeffs;
}

// ============================================================
// Layer 3A：环境修正乘数（大运 + 流年）
// ============================================================
// ── 地支关系判断辅助 ────────────────────────────────────────
function zhi_liu_chong(a, b) { return LIU_CHONG.some(s => setEquals(new Set([a,b]), s)); }
function zhi_liu_hai(a, b)   { return LIU_HAI.some(s => setEquals(new Set([a,b]), s)); }
function zhi_xiang_xing(a, b){ return XIANG_XING.some(s => setEquals(new Set([a,b]), s)); }
function zhi_liu_he_out(a, b) {
    if (a === b) return null;
    const p = new Set([a, b]);
    for (let h of LIU_HE) if (setEquals(p, h.set)) return h.out;
    return null;
}

// ── 地支互动对环境乘数的影响（可配置）───────────────────────
// 流年权重 > 大运：流年是当岁主气，对当年/各月影响更直接；大运只作背景微调
const ENV_BONUS = {
    dy:  { chong_ji: 1.05, chong_xi: 0.96, he_xi: 1.03, he_ji: 0.97, ban_xi: 1.02, ban_ji: 0.98, hai: 0.98, xing: 0.98 },
    yn:  { chong_ji: 1.15, chong_xi: 0.85, he_xi: 1.10, he_ji: 0.90, ban_xi: 1.08, ban_ji: 0.92, hai: 0.93, xing: 0.93 }
};

function apply_zhi_interactions(m, zhi_src, chart_zhis, coeffs, bonus) {
    const sx = wx => (coeffs[wx] || 0);
    for (let yz of chart_zhis) {
        const yz_wx = get_zhi_main_wuxing(yz);
        // 六冲
        if (zhi_liu_chong(zhi_src, yz)) {
            m *= sx(yz_wx) < 0 ? bonus.chong_ji : sx(yz_wx) > 0 ? bonus.chong_xi : 1.0;
        }
        // 六合
        const he_out = zhi_liu_he_out(zhi_src, yz);
        if (he_out) {
            m *= sx(he_out) > 0 ? bonus.he_xi : sx(he_out) < 0 ? bonus.he_ji : 1.0;
        }
        // 六害
        if (zhi_liu_hai(zhi_src, yz)) { m *= bonus.hai; }
        // 相刑
        if (zhi_xiang_xing(zhi_src, yz)) { m *= bonus.xing; }
        // 半三合
        const bh = get_ban_san_he(zhi_src, yz);
        if (bh) { m *= sx(bh) > 0 ? bonus.ban_xi : sx(bh) < 0 ? bonus.ban_ji : 1.0; }
    }
    return m;
}

function get_env_multiplier(period, coeffs, bazi) {
    if (!period) return 1.0;

    const sx = wx => (coeffs[wx] || 0);
    let m = 1.0;

    // 原局四柱地支（用于与大运/流年做互动判断）
    const chart_zhis = bazi
        ? ['year','month','day','time'].map(p => bazi[p] && bazi[p].zhi).filter(Boolean)
        : [];

    // ── 大运修正 ────────────────────────────────────────────
    const dy = period.dayun || '';
    if (dy.length >= 2 && dy !== '——') {
        const dy_gan_wx = GAN_TO_WUXING[dy[0]];
        const dy_zhi    = dy[1];
        const dy_zhi_wx = get_zhi_main_wuxing(dy_zhi);
        // 大运干支本身喜忌（权重降低：背景微调）
        if (dy_gan_wx) { m *= sx(dy_gan_wx) > 0 ? 1.04 : sx(dy_gan_wx) < 0 ? 0.96 : 1.0; }
        if (dy_zhi_wx) { m *= sx(dy_zhi_wx) > 0 ? 1.04 : sx(dy_zhi_wx) < 0 ? 0.96 : 1.0; }
        // 大运地支与原局四支的六冲/六合/相刑/六害/半三合
        m = apply_zhi_interactions(m, dy_zhi, chart_zhis, coeffs, ENV_BONUS.dy);
    }

    // ── 流年修正 ────────────────────────────────────────────
    const yn = period.year || '';
    if (yn.length >= 2) {
        const yn_gan_wx = GAN_TO_WUXING[yn[0]];
        const yn_zhi    = yn[1];
        const yn_zhi_wx = get_zhi_main_wuxing(yn_zhi);
        // 流年干支本身喜忌（权重提高：当岁主气）
        if (yn_gan_wx) { m *= sx(yn_gan_wx) > 0 ? 1.15 : sx(yn_gan_wx) < 0 ? 0.85 : 1.0; }
        if (yn_zhi_wx) { m *= sx(yn_zhi_wx) > 0 ? 1.15 : sx(yn_zhi_wx) < 0 ? 0.85 : 1.0; }
        // 流年地支与原局四支的六冲/六合/相刑/六害/半三合
        m = apply_zhi_interactions(m, yn_zhi, chart_zhis, coeffs, ENV_BONUS.yn);

        // 大运与流年天克地冲：×0.6
        if (dy.length >= 2 && dy !== '——') {
            const gan_clash = is_gan_ke(dy[0], yn[0]) || is_gan_ke(yn[0], dy[0]);
            const zhi_clash = is_liu_chong(dy[1], yn[1]);
            if (gan_clash && zhi_clash) m *= 0.6;
        }
    }

    return Math.max(0.3, Math.min(1.5, m));
}

// ============================================================
// Layer 3B + 4：流月组合分（地支互动）+ 额外触发器
// 返回 { dyn, tiankediachong }
// dyn：各五行的纯动态交互分（不含系数基础）
// tiankediachong：流月与日柱是否天克地冲（需在主函数整体×0.5）
// ============================================================
function compute_combination_scores(bazi, liuyue_gan, liuyue_zhi, coeffs, bazi_raw) {
    const dyn = { 金:0, 木:0, 水:0, 火:0, 土:0 };
    const yuanju = ['year','month','day','time']
        .map(p => bazi[p] && bazi[p].zhi)
        .filter(Boolean);

    const ly_wx    = get_zhi_main_wuxing(liuyue_zhi);
    const avoid_wx = new Set(WUXING_LIST.filter(wx => coeffs[wx] < 0));
    const fav_wx   = new Set(WUXING_LIST.filter(wx => coeffs[wx] > 0));

    // 流月与原局各支逐一比对
    for (let yz of yuanju) {
        const pair  = new Set([liuyue_zhi, yz]);
        const yz_wx = get_zhi_main_wuxing(yz);

        // 六冲
        if (LIU_CHONG.some(s => setEquals(pair, s)) && yz_wx) {
            dyn[yz_wx] -= 2;
            // 冲去忌神：额外奖励流月主气
            if (avoid_wx.has(yz_wx) && ly_wx) dyn[ly_wx] += 1;
            // 冲去喜神：额外惩罚流月主气
            if (fav_wx.has(yz_wx)   && ly_wx) dyn[ly_wx] -= 1;
        }

        // 六合（区分化气成功 vs 合而不化）
        for (let he of LIU_HE) {
            if (setEquals(pair, he.set)) {
                const hua_wx = he.out;
                // 化气成功判断：化神五行在原局有一定根基（存量≥1.0）→ 场能支撑化气
                // 若原局化神薄弱，则"合住"但化气不成，双方只是互相牵制
                const hua_success = (bazi_raw[hua_wx] || 0) >= 1.0;

                if (hua_success) {
                    // 化气成功：原始五行力量部分转移到化神（原始-1，化神+3）
                    if (ly_wx && ly_wx !== hua_wx) dyn[ly_wx] -= 1;
                    if (yz_wx && yz_wx !== hua_wx) dyn[yz_wx] -= 1;
                    dyn[hua_wx] += 3;
                } else {
                    // 合而不化：轻微牵制，各+0.5（保守，避免六合全员加分）
                    if (ly_wx) dyn[ly_wx] += 0.5;
                    if (yz_wx) dyn[yz_wx] += 0.5;
                }
            }
        }

        // 相刑 / 自刑
        let xing = XIANG_XING.some(s => setEquals(pair, s));
        if (liuyue_zhi === yz && ZI_XING.has(liuyue_zhi)) xing = true;
        if (xing) {
            if (ly_wx)  dyn[ly_wx]  -= 1;
            if (yz_wx)  dyn[yz_wx]  -= 1;
        }

        // 六害
        if (LIU_HAI.some(s => setEquals(pair, s))) {
            if (ly_wx)  dyn[ly_wx]  -= 1;
            if (yz_wx)  dyn[yz_wx]  -= 1;
        }
    }

    // 三合 / 三会（全合优先，有全合则不计半合）
    const pairs = [];
    for (let i = 0; i < yuanju.length; i++)
        for (let j = i+1; j < yuanju.length; j++)
            pairs.push([yuanju[i], yuanju[j]]);

    let fullHit = false;
    for (let [z1, z2] of pairs) {
        const trio = new Set([liuyue_zhi, z1, z2]);
        for (let c of SAN_HE)  if (setEquals(trio, c.set)) { dyn[c.out] += 3; fullHit = true; }
        for (let c of SAN_HUI) if (setEquals(trio, c.set)) { dyn[c.out] += 3; fullHit = true; }
    }
    if (!fullHit) {
        for (let yz of yuanju) {
            const bh  = get_ban_san_he(liuyue_zhi, yz);  if (bh)  dyn[bh]  += 1.5;
            const bhu = get_ban_san_hui(liuyue_zhi, yz); if (bhu) dyn[bhu] += 1.5;
        }
    }

    // ── Layer 4 额外触发器 ──────────────────────────────────
    const day_gan = bazi.day.gan;
    const day_zhi = bazi.day.zhi;

    // L4-5a：伏吟（流月地支 = 日柱地支：-15换算≈全局-2.5）
    if (liuyue_zhi === day_zhi) {
        for (let wx of WUXING_LIST) dyn[wx] -= 2.5;
    }
    // L4-5b：反吟（流月地支冲日柱地支：-8换算≈全局-1.5）
    else if (is_liu_chong(liuyue_zhi, day_zhi)) {
        for (let wx of WUXING_LIST) dyn[wx] -= 1.5;
    }

    // L4-7：喜神入墓（流月地支为喜神之墓且无冲开）
    for (let wx of WUXING_LIST) {
        if (coeffs[wx] > 0 && MU_KU[wx] === liuyue_zhi) {
            const opened = yuanju.some(yz => is_liu_chong(liuyue_zhi, yz));
            if (!opened) dyn[wx] -= 3;
        }
    }

    // L4-8：忌神逢长生/帝旺（在流月得强根→更凶）
    const YANG_GANS = ['甲','丙','戊','庚','壬'];
    for (let wx of WUXING_LIST) {
        if (coeffs[wx] < 0) {
            const yang_gan = YANG_GANS.find(g => GAN_TO_WUXING[g] === wx);
            if (yang_gan) {
                const stage = get_chang_sheng(yang_gan, liuyue_zhi);
                if (stage === '长生' || stage === '帝旺') dyn[wx] -= 1.5;
            }
        }
    }

    // L4-6：天克地冲（流月与日柱），以标志位返回，主函数做全局×0.5
    let tiankediachong = false;
    if (liuyue_gan && day_gan) {
        const ganClash = is_gan_ke(liuyue_gan, day_gan) || is_gan_ke(day_gan, liuyue_gan);
        const zhiClash = is_liu_chong(liuyue_zhi, day_zhi);
        if (ganClash && zhiClash) tiankediachong = true;
    }

    return { dyn, tiankediachong };
}

// ============================================================
// Layer 5：多来源候选 + 近并列破平
// ──────────────────────────────────────────────────────────
// 扶抑 / 通关 / 过旺泄秀 / 调候 各推一个候选，来源加权接近：
//   提名分 = 该五行扶抑底分 + SOURCE_BONUS（各来源同一常量）
// 取「最高提名分 − TIE_DELTA」以内的候选池；
// 池内按「本年已算出月份中出现次数最少」破平，次数相同再比提名分。
// ============================================================
const LAYER5_SOURCE_BONUS = 6.0;   // 各来源加权对齐
const LAYER5_TIE_DELTA    = 3.0;   // 近并列窗口

function run_conflict_detector(final_scores, dyn, coeffs, liuyue_zhi, bazi, period, bazi_raw, prev_favors) {
    const nominations = [];  // { wx, score, reason }
    const boosts = { 木:0, 火:0, 土:0, 金:0, 水:0 };

    const nominate = (wx, reason) => {
        if (!wx) return;
        const score = (final_scores[wx] || 0) + LAYER5_SOURCE_BONUS;
        nominations.push({ wx, score, reason });
        boosts[wx] = Math.max(boosts[wx] || 0, LAYER5_SOURCE_BONUS);
    };

    // ── 扶抑：底分最高者 ────────────────────────────────────
    const fuyi_winner = WUXING_LIST.reduce(
        (best, wx) => (final_scores[wx]||0) > (final_scores[best]||0) ? wx : best, WUXING_LIST[0]
    );
    nominate(fuyi_winner, '正格扶抑');

    // ── 通关 ────────────────────────────────────────────────
    const ly_wx_main = get_zhi_main_wuxing(liuyue_zhi);
    for (let [atk, tgt] of [['木','土'],['土','水'],['水','火'],['火','金'],['金','木']]) {
        if ((bazi_raw[atk]||0) >= 1.5 && (bazi_raw[tgt]||0) >= 1.5) {
            const ly_in_atk = (ly_wx_main === atk);
            const dyn_boosts_atk = (dyn[atk]||0) >= 1.0;
            if (ly_in_atk || dyn_boosts_atk) {
                nominate(WUXING_SHENG[atk], '通关');
            }
        }
    }

    // ── 过旺泄秀 ────────────────────────────────────────────
    for (let wx of WUXING_LIST) {
        if ((bazi_raw[wx]||0) >= 1.5 && (dyn[wx]||0) >= 2.0) {
            nominate(WUXING_SHENG[wx], '过旺泄秀');
        }
    }

    // ── 调候（用神本月未被打残才提名）──────────────────────
    const th_flow = TIAHOU_TABLE[liuyue_zhi];
    if (th_flow && th_flow.need && th_flow.urgency >= 0.3) {
        const th_orig     = TIAHOU_TABLE[bazi.month.zhi];
        const same_need   = th_orig && th_orig.need === th_flow.need;
        const eff_urgency = th_flow.urgency + (same_need ? 0.2 : 0);
        const tiahou_dyn  = dyn[th_flow.need] || 0;
        if (eff_urgency >= 0.4 && tiahou_dyn >= -1.0) {
            nominate(th_flow.need, '调候');
        }
    }

    // ── 同五行多来源：保留提名分最高的一条 ──────────────────
    const bestByWx = {};
    for (let n of nominations) {
        if (!bestByWx[n.wx] || n.score > bestByWx[n.wx].score) bestByWx[n.wx] = n;
    }
    const unique = Object.keys(bestByWx).map(wx => bestByWx[wx]);

    // ── 近并列池：最高分 − TIE_DELTA ────────────────────────
    const maxNom = unique.reduce((m, n) => Math.max(m, n.score), -Infinity);
    const pool = unique.filter(n => n.score >= maxNom - LAYER5_TIE_DELTA);

    // ── 破平：本年已出现次数少者优先 ────────────────────────
    const hist = Array.isArray(prev_favors) ? prev_favors : [];
    const countOf = wx => hist.filter(x => x === wx).length;

    pool.sort((a, b) => {
        const ca = countOf(a.wx), cb = countOf(b.wx);
        if (ca !== cb) return ca - cb;                 // 出现少的优先
        if (b.score !== a.score) return b.score - a.score; // 再比提名分
        return 0;
    });

    const winner = pool[0];
    const conflict_type = winner.reason;

    // adjusted_scores：扶抑底分 + 该五行获得的来源加权（供展示）
    const adjusted = {};
    for (let wx of WUXING_LIST) {
        adjusted[wx] = (final_scores[wx] || 0) + (boosts[wx] || 0);
    }

    return {
        adjusted_scores: adjusted,
        conflict_type,
        favorable_element: winner.wx,
        candidate_pool: pool.map(n => ({ wx: n.wx, score: n.score, reason: n.reason, prior_count: countOf(n.wx) }))
    };
}

// ============================================================
// 弱势生活域检测（用于"本月补运"推荐）
// 每月固定选出最弱的两个领域 A、B（不再因分差过小只返回一个）
// 弱势分 = 该十神对应五行的本月综合分（adjusted_scores，越低越需补）
// ============================================================
function get_monthly_weak_domain(dm_gan, adjusted_scores, coeffs, gender) {
    const dm_wuxing = GAN_TO_WUXING[dm_gan];
    let yin_wuxing  = null;
    for (let k in WUXING_SHENG) {
        if (WUXING_SHENG[k] === dm_wuxing) { yin_wuxing = k; break; }
    }

    const shishen_wx = {
        '比劫': dm_wuxing,
        '食伤': WUXING_SHENG[dm_wuxing],
        '财才': WUXING_KE[dm_wuxing]
    };
    for (let k in WUXING_KE)    { if (WUXING_KE[k]    === dm_wuxing) { shishen_wx['官杀'] = k; break; } }
    if (yin_wuxing) shishen_wx['印枭'] = yin_wuxing;

    const mapping = (gender === 1 || gender === '1' || gender === 'male')
        ? DOMAIN_MAPPING_MALE : DOMAIN_MAPPING_FEMALE;

    // 用本月综合分衡量领域强弱；忌神五行额外扣分，更容易进入补运
    const AVOID_BASE = 2;
    const domain_scores = {};
    for (let ss in mapping) {
        const wx = shishen_wx[ss];
        const avoid_penalty = (coeffs[wx] || 0) < 0 ? AVOID_BASE : 0;
        domain_scores[mapping[ss]] = (adjusted_scores[wx] || 0) - avoid_penalty;
    }

    // 固定取最弱两个：A = 最弱，B = 次弱
    const sorted = Object.keys(domain_scores).sort((a, b) => domain_scores[a] - domain_scores[b]);
    return [sorted[0], sorted[1]];
}

// ============================================================
// 主函数：get_monthly_favorable_element
// bazi        : { year, month, day, time } 各含 {gan, zhi}
// liuyue_raw  : 流月干支字符串（"壬申"2字优先；兼容"申"单字旧接口）
// gender      : 1/'1'/'male' = 男，其余 = 女
// period      : { dayun, year, month } 干支字符串，可传null（调试兼容）
// prev_favors : 本年已算出的喜用五行数组（用于近并列破平），可省略
// ============================================================
function get_monthly_favorable_element(bazi, liuyue_raw, gender, period, prev_favors) {
    // 解析流月干支
    const liuyue_gan = (liuyue_raw && liuyue_raw.length >= 2) ? liuyue_raw[0] : null;
    const liuyue_zhi = (liuyue_raw && liuyue_raw.length >= 2) ? liuyue_raw[1] : (liuyue_raw || '');

    // ── Layer 1：旺衰积分 ────────────────────────────────────
    const str = determine_strength_v2(bazi);
    const { dm_gan, status } = str;

    // 原局五行基础分（用于Layer2覆盖规则）
    const bazi_raw = get_base_element_scores(bazi);

    // ── Layer 2：效用系数（含调候/通关/病药覆盖）────────────
    const coeffs = build_coefficients(str, bazi.month.zhi, bazi_raw);

    // ── Layer 3A：环境乘数 ───────────────────────────────────
    const env_mult = get_env_multiplier(period || null, coeffs, bazi);

    // ── Layer 3B + 4：流月组合动态分 ────────────────────────
    const { dyn, tiankediachong } = compute_combination_scores(
        bazi, liuyue_gan, liuyue_zhi, coeffs, bazi_raw
    );

    // 天克地冲：全局×0.5（在加上base之前应用于整体）
    const tkdc_mult = tiankediachong ? 0.5 : 1.0;

    // 合并最终分
    // = (系数基础 × 5  +  月干贡献  +  动态组合分) × 环境乘数 × 天克地冲系数
    const final_scores = {};
    for (let wx of WUXING_LIST) {
        const base  = coeffs[wx] * 5;
        // 月干若与该五行匹配，额外贡献（权重约0.4×基础）
        const stem  = (liuyue_gan && GAN_TO_WUXING[liuyue_gan] === wx)
            ? coeffs[wx] * 2.0 : 0;
        final_scores[wx] = (base + stem + dyn[wx]) * env_mult * tkdc_mult;
    }

    // ── Layer 5：多候选 + 本年频次破平 ───────────────────────
    const { adjusted_scores, conflict_type, favorable_element, candidate_pool } = run_conflict_detector(
        final_scores, dyn, coeffs, liuyue_zhi, bazi, period || null, bazi_raw, prev_favors || []
    );

    const score = Math.round(adjusted_scores[favorable_element] || 0);

    // 弱势域：先取最弱两个十神领域，再展开为运名；作图最多 2 个名字
    // weak_domains：十神领域 key；weak_domain_labels：最终展示的 A/B（各 1 个运名）
    const weak_domains = get_monthly_weak_domain(dm_gan, adjusted_scores, coeffs, gender);
    const yunPair = pick_two_yun_names(
        weak_domains,
        (liuyue_gan || '') + (liuyue_zhi || '') + '|' + weak_domains.join('|')
    );
    const weak_domain_labels = [[yunPair[0]], [yunPair[1]]];

    return {
        // 核心输出（与旧接口保持兼容）
        favorable_element,
        score,
        shen_qiang_ruo: status,
        weak_domains,
        weak_domain_labels,
        // 扩展字段（调试/未来使用）
        conflict_type,
        strength_score: str.score,
        all_scores:     adjusted_scores,
        candidate_pool: candidate_pool || []
    };
}

// ============================================================
// 按年顺序计算十二流月喜用（破平窗口 = 本年已算出的月份）
// months: 干支字符串数组，如 ['庚寅','辛卯',...]，按正月→十二月顺序
// ============================================================
function get_year_monthly_favorable(bazi, months, gender, period) {
    const results = [];
    const prev_favors = [];
    for (let gz of months) {
        const r = get_monthly_favorable_element(bazi, gz, gender, period, prev_favors);
        results.push(Object.assign({ liuyue: gz }, r));
        prev_favors.push(r.favorable_element);
    }
    return results;
}

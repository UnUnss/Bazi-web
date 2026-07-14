// 轻量多语言（i18n）模块。
// 用法：给需要翻译的元素加 data-i18n / data-i18n-placeholder / data-i18n-alt / data-i18n-aria-label，
// 值为下面字典里的 key；也可以在业务 JS 里调用 t(key) 取得当前语言的文案（用于动态拼接的文本，
// 比如「大运」「年」「月」这类跟随排盘结果拼接出来的字段）。
(function (global) {
    const DICTS = {
        'zh-TW': {
            meta_title: '八字定製每月運勢壁紙',
            nav_brand: '運勢壁紙',
            nav_user_aria: '用戶',
            nav_home: '首頁',
            nav_about: '關於我們',
            nav_contact: '聯絡我們',
            nav_policy: '用戶服務與隱私協議',
            nav_pricing: '定價',
            nav_login: '登入 / 註冊',
            nav_logout: '退出',
            nav_account: '帳號管理',
            nav_download_history: '下載記錄',
            login_modal_title: '登入',
            signup_modal_title: '註冊',
            login_email_label: '郵箱',
            login_password_label: '密碼',
            login_code_label: '驗證碼',
            btn_get_code: '獲取驗證碼',
            code_sent_notice: '驗證碼已發送（模擬）：',
            code_not_sent_notice: '請先點擊「獲取驗證碼」',
            code_invalid_notice: '驗證碼不正確，請重新獲取',
            btn_login_submit: '登入',
            btn_signup_submit: '註冊',
            auth_toggle_to_signup_prefix: '還沒有帳號？',
            auth_toggle_to_signup_action: '立即註冊',
            auth_toggle_to_login_prefix: '已有帳號？',
            auth_toggle_to_login_action: '直接登入',
            mock_feature_notice: '此功能為演示效果，敬請期待正式上線。',
            signup_subscribe_label: '訂閱每月換運提示，及時獲取壁紙更新通知',
            pay_per_image: '/ 張',
            pay_notice: '虛擬商品，購買後不支持退款',
            pay_confirm: '確認支付',
            pillar_year: '年柱',
            pillar_month: '月柱',
            pillar_day: '日柱',
            pillar_hour: '時柱',
            period_dayun: '大運',
            period_year: '年',
            period_month: '月',
            btn_add_bazi: '+ 新增八字',
            btn_switch_bazi: '切換八字',
            wallpaper_section_title: '本月專屬壁紙',
            wallpaper_favor_group_title: '本月喜用',
            wallpaper_favor1_name: '水 · 深藍',
            wallpaper_favor1_desc: '滋養日主，平穩情緒。助你沉靜思考',
            wallpaper_favor1_alt: '本月喜用壁紙一',
            wallpaper_favor2_name: '木 · 青竹',
            wallpaper_favor2_desc: '生扶日主，舒展心緒，助你穩健前行',
            wallpaper_favor2_alt: '本月喜用壁紙二',
            wallpaper_boost_group_title: '本月補運',
            wallpaper_boost1_name: '桃花運 · 緋紅',
            wallpaper_boost1_desc: '催旺人緣與情感連結，宜多社交走動',
            wallpaper_boost1_alt: '本月補運壁紙一',
            wallpaper_boost2_name: '財運 · 金黃',
            wallpaper_boost2_desc: '催旺財氣與貴人運，宜把握機會、大膽出手',
            wallpaper_boost2_alt: '本月補運壁紙二',
            btn_download: '下載壁紙',
            modal_add_title: '新增八字',
            modal_close_aria: '關閉',
            form_nickname_label: '暱稱',
            form_nickname_placeholder: '如：本人、伴侶',
            form_gender_label: '性別',
            gender_male: '男',
            gender_female: '女',
            form_birth_label: '出生信息',
            form_birth_date_label: '出生日期（公曆）',
            form_birth_time_label: '出生時間',
            form_birthplace_label: '出生地點',
            form_birthplace_placeholder: '城市',
            loc_placeholder_country: '選擇國家/地區…',
            loc_placeholder_state: '選擇省/州…',
            loc_placeholder_city: '選擇城市…',
            form_true_solar_label: '真太陽時',
            form_true_solar_desc: '依出生地經度修正時柱，排盤更精準',
            location_searching: '搜尋中…',
            location_no_result: '未找到結果',
            location_search_error: '搜尋失敗，請稍後再試',
            alert_need_birthplace: '請先搜尋並選擇出生地點',
            btn_save: '保存八字',
            alert_fill_required: '請填寫完整信息',
            lang_zh_tw: '繁',
            lang_zh_cn: '简',
            lang_en: 'EN',
            lang_menu_zh_tw: '繁體中文',
            lang_menu_zh_cn: '简体中文',
            lang_menu_en: 'English',
            cta_start: '開始',
            cta_sub: '基於生辰八字\n定制每月運勢壁紙'
        },
        'zh-CN': {
            meta_title: '八字定制每月运势壁纸',
            nav_brand: '运势壁纸',
            nav_user_aria: '用户',
            nav_home: '首页',
            nav_about: '关于我们',
            nav_contact: '联系我们',
            nav_policy: '用户服务与隐私协议',
            nav_pricing: '定价',
            nav_login: '登录 / 注册',
            nav_logout: '退出',
            nav_account: '账号管理',
            nav_download_history: '下载记录',
            login_modal_title: '登录',
            signup_modal_title: '注册',
            login_email_label: '邮箱',
            login_password_label: '密码',
            login_code_label: '验证码',
            btn_get_code: '获取验证码',
            code_sent_notice: '验证码已发送（模拟）：',
            code_not_sent_notice: '请先点击「获取验证码」',
            code_invalid_notice: '验证码不正确，请重新获取',
            btn_login_submit: '登录',
            btn_signup_submit: '注册',
            auth_toggle_to_signup_prefix: '还没有账号？',
            auth_toggle_to_signup_action: '立即注册',
            auth_toggle_to_login_prefix: '已有账号？',
            auth_toggle_to_login_action: '直接登录',
            mock_feature_notice: '此功能为演示效果，敬请期待正式上线。',
            signup_subscribe_label: '订阅每月换运提示，及时获取壁纸更新通知',
            pay_per_image: '/ 张',
            pay_notice: '虚拟商品，购买后不支持退款',
            pay_confirm: '确认支付',
            pillar_year: '年柱',
            pillar_month: '月柱',
            pillar_day: '日柱',
            pillar_hour: '时柱',
            period_dayun: '大运',
            period_year: '年',
            period_month: '月',
            btn_add_bazi: '+ 新增八字',
            btn_switch_bazi: '切换八字',
            wallpaper_section_title: '本月专属壁纸',
            wallpaper_favor_group_title: '本月喜用',
            wallpaper_favor1_name: '水 · 深蓝',
            wallpaper_favor1_desc: '滋养日主，平稳情绪。助你沉静思考',
            wallpaper_favor1_alt: '本月喜用壁纸一',
            wallpaper_favor2_name: '木 · 青竹',
            wallpaper_favor2_desc: '生扶日主，舒展心绪，助你稳健前行',
            wallpaper_favor2_alt: '本月喜用壁纸二',
            wallpaper_boost_group_title: '本月补运',
            wallpaper_boost1_name: '桃花运 · 绯红',
            wallpaper_boost1_desc: '催旺人缘与情感连结，宜多社交走动',
            wallpaper_boost1_alt: '本月补运壁纸一',
            wallpaper_boost2_name: '财运 · 金黄',
            wallpaper_boost2_desc: '催旺财气与贵人运，宜把握机会、大胆出手',
            wallpaper_boost2_alt: '本月补运壁纸二',
            btn_download: '下载壁纸',
            modal_add_title: '新增八字',
            modal_close_aria: '关闭',
            form_nickname_label: '昵称',
            form_nickname_placeholder: '如：本人、伴侣',
            form_gender_label: '性别',
            gender_male: '男',
            gender_female: '女',
            form_birth_label: '出生信息',
            form_birth_date_label: '出生日期（公历）',
            form_birth_time_label: '出生时间',
            form_birthplace_label: '出生地点',
            form_birthplace_placeholder: '城市',
            loc_placeholder_country: '选择国家/地区…',
            loc_placeholder_state: '选择省/州…',
            loc_placeholder_city: '选择城市…',
            form_true_solar_label: '真太阳时',
            form_true_solar_desc: '依出生地经度修正时柱，排盘更精准',
            location_searching: '搜索中…',
            location_no_result: '未找到结果',
            location_search_error: '搜索失败，请稍后再试',
            alert_need_birthplace: '请先搜索并选择出生地点',
            btn_save: '保存八字',
            alert_fill_required: '请填写完整信息',
            lang_zh_tw: '繁',
            lang_zh_cn: '简',
            lang_en: 'EN',
            lang_menu_zh_tw: '繁體中文',
            lang_menu_zh_cn: '简体中文',
            lang_menu_en: 'English',
            cta_start: '开始',
            cta_sub: '基于生辰八字\n定制每月运势壁纸'
        },
        'en': {
            meta_title: 'BaZi Monthly Fortune Wallpaper',
            nav_brand: 'Fortune Wallpaper',
            nav_user_aria: 'User',
            nav_home: 'Home',
            nav_about: 'About Us',
            nav_contact: 'Contact Us',
            nav_policy: 'Terms of Service & Privacy Policy',
            nav_pricing: 'Pricing',
            nav_login: 'Log In / Sign Up',
            nav_logout: 'Log Out',
            nav_account: 'Account',
            nav_download_history: 'Download History',
            login_modal_title: 'Log In',
            signup_modal_title: 'Sign Up',
            login_email_label: 'Email',
            login_password_label: 'Password',
            login_code_label: 'Verification Code',
            btn_get_code: 'Get Code',
            code_sent_notice: 'Code sent (demo):',
            code_not_sent_notice: 'Please click "Get Code" first',
            code_invalid_notice: 'Incorrect code, please request a new one',
            btn_login_submit: 'Log In',
            btn_signup_submit: 'Sign Up',
            auth_toggle_to_signup_prefix: "Don't have an account?",
            auth_toggle_to_signup_action: 'Sign up',
            auth_toggle_to_login_prefix: 'Already have an account?',
            auth_toggle_to_login_action: 'Log in',
            mock_feature_notice: 'This is a demo feature. Stay tuned for the full launch.',
            signup_subscribe_label: 'Subscribe to monthly luck-cycle reminders and wallpaper update notifications',
            pay_per_image: '/ image',
            pay_notice: 'Virtual product — no refunds after purchase',
            pay_confirm: 'Confirm Payment',
            pillar_year: 'Year Pillar',
            pillar_month: 'Month Pillar',
            pillar_day: 'Day Pillar',
            pillar_hour: 'Hour Pillar',
            period_dayun: 'Luck Cycle',
            period_year: 'Year',
            period_month: 'Month',
            btn_add_bazi: '+ Add BaZi',
            btn_switch_bazi: 'Switch BaZi',
            wallpaper_section_title: "This Month's Wallpapers",
            wallpaper_favor_group_title: 'Favorable Element',
            wallpaper_favor1_name: 'Water · Deep Blue',
            wallpaper_favor1_desc: 'Nourishes your Day Master and calms emotions, helping you think clearly.',
            wallpaper_favor1_alt: 'Favorable element wallpaper 1',
            wallpaper_favor2_name: 'Wood · Bamboo Green',
            wallpaper_favor2_desc: 'Supports your Day Master and eases the mind, helping you move forward steadily.',
            wallpaper_favor2_alt: 'Favorable element wallpaper 2',
            wallpaper_boost_group_title: 'Supportive Boost',
            wallpaper_boost1_name: 'Romance Luck · Crimson',
            wallpaper_boost1_desc: 'Boosts relationships and social connections — a great time to go out and mingle.',
            wallpaper_boost1_alt: 'Supportive boost wallpaper 1',
            wallpaper_boost2_name: 'Wealth Luck · Golden',
            wallpaper_boost2_desc: 'Boosts wealth and beneficial connections — a good time to seize opportunities boldly.',
            wallpaper_boost2_alt: 'Supportive boost wallpaper 2',
            btn_download: 'Download Wallpaper',
            modal_add_title: 'Add BaZi Profile',
            modal_close_aria: 'Close',
            form_nickname_label: 'Nickname',
            form_nickname_placeholder: 'e.g. Myself, Partner',
            form_gender_label: 'Gender',
            gender_male: 'Male',
            gender_female: 'Female',
            form_birth_label: 'Birth Date & Time',
            form_birth_date_label: 'Birth Date (Gregorian)',
            form_birth_time_label: 'Birth Time',
            form_birthplace_label: 'Birthplace',
            form_birthplace_placeholder: 'City',
            loc_placeholder_country: 'Select Country / Region…',
            loc_placeholder_state: 'Select Province / State…',
            loc_placeholder_city: 'Select City…',
            form_true_solar_label: 'True Solar Time (TST)',
            form_true_solar_desc: 'Correct birth hour by longitude for more accurate BaZi',
            location_searching: 'Searching…',
            location_no_result: 'No results found',
            location_search_error: 'Search failed, please try again',
            alert_need_birthplace: 'Please search and select a birthplace first',
            btn_save: 'Save Profile',
            alert_fill_required: 'Please fill in all fields',
            lang_zh_tw: 'TC',
            lang_zh_cn: 'SC',
            lang_en: 'EN',
            lang_menu_zh_tw: '繁體中文',
            lang_menu_zh_cn: '简体中文',
            lang_menu_en: 'English',
            cta_start: 'Start',
            cta_sub: 'Personalized monthly fortune wallpapers based on your BaZi'
        }
    };

    const SUPPORTED = Object.keys(DICTS);
    const DEFAULT_LANG = 'zh-TW';
    const STORAGE_KEY = 'bazi_lang';

    function detectLang() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved && DICTS[saved]) return saved;
        } catch (_) {}

        try {
            const q = new URLSearchParams(location.search).get('lang');
            if (q && DICTS[q]) return q;
        } catch (_) {}

        const nav = ((navigator.language || navigator.userLanguage || '') + '').toLowerCase();
        if (nav.startsWith('zh-tw') || nav.startsWith('zh-hk') || nav.startsWith('zh-mo')) return 'zh-TW';
        if (nav.startsWith('zh')) return 'zh-CN';
        if (nav.startsWith('en')) return 'en';
        return DEFAULT_LANG;
    }

    let currentLang = detectLang();

    function t(key) {
        const dict = DICTS[currentLang] || DICTS[DEFAULT_LANG];
        if (dict && dict[key] != null) return dict[key];
        return (DICTS[DEFAULT_LANG][key] != null) ? DICTS[DEFAULT_LANG][key] : key;
    }

    function applyI18n(root) {
        const scope = root || document;

        scope.querySelectorAll('[data-i18n]').forEach((el) => {
            el.textContent = t(el.getAttribute('data-i18n'));
        });
        scope.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
            el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
        });
        scope.querySelectorAll('[data-i18n-alt]').forEach((el) => {
            el.setAttribute('alt', t(el.getAttribute('data-i18n-alt')));
        });
        scope.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
            el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria-label')));
        });

        document.title = t('meta_title');
        document.documentElement.setAttribute('lang', currentLang);

        scope.querySelectorAll('[data-lang-option]').forEach((el) => {
            el.classList.toggle('active', el.getAttribute('data-lang-option') === currentLang);
        });
    }

    function setLanguage(lang) {
        if (!DICTS[lang] || lang === currentLang) return;
        currentLang = lang;
        try { localStorage.setItem(STORAGE_KEY, lang); } catch (_) {}
        applyI18n();
        document.dispatchEvent(new CustomEvent('i18n:change', { detail: { lang } }));
    }

    function getLanguage() {
        return currentLang;
    }

    global.I18N = {
        t,
        applyI18n,
        setLanguage,
        getLanguage,
        supportedLanguages: SUPPORTED
    };

    document.addEventListener('DOMContentLoaded', () => applyI18n());
})(window);

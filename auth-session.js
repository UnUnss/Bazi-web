// 次级页面共用：与 landing.html 同步 Supabase 会话 / 退出
(function (global) {
  const SUPABASE_URL = 'https://yyiecrsibflscgjxmvbn.supabase.co';
  const SUPABASE_ANON = 'sb_publishable_v-LV28YijQFfr2wAHFajmw_GkfU9u1A';
  const AUTH_KEY = 'bazi_logged_in';
  const AUTH_EMAIL_KEY = 'bazi_logged_email';
  const AUTH_EMAIL_KEY_LEGACY = 'bazi_logged_in_email';

  let _client = null;

  function getClient() {
    if (_client) return _client;
    if (typeof supabase === 'undefined' || !supabase.createClient) return null;
    _client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
    return _client;
  }

  function setLocalLoggedIn(email) {
    localStorage.setItem(AUTH_KEY, '1');
    localStorage.setItem(AUTH_EMAIL_KEY, email || '');
    localStorage.removeItem(AUTH_EMAIL_KEY_LEGACY);
  }

  function clearLocalLoggedIn() {
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(AUTH_EMAIL_KEY);
    localStorage.removeItem(AUTH_EMAIL_KEY_LEGACY);
  }

  async function syncFromSupabase() {
    const client = getClient();
    if (!client) return { loggedIn: localStorage.getItem(AUTH_KEY) === '1', email: localStorage.getItem(AUTH_EMAIL_KEY) || '' };
    try {
      const { data: { session } } = await client.auth.getSession();
      const email = session?.user?.email || '';
      if (email) {
        setLocalLoggedIn(email);
        return { loggedIn: true, email };
      }
      clearLocalLoggedIn();
      return { loggedIn: false, email: '' };
    } catch (_) {
      return {
        loggedIn: localStorage.getItem(AUTH_KEY) === '1',
        email: localStorage.getItem(AUTH_EMAIL_KEY) || localStorage.getItem(AUTH_EMAIL_KEY_LEGACY) || '',
      };
    }
  }

  async function signOut() {
    const client = getClient();
    try {
      if (client) await client.auth.signOut();
    } catch (_) {}
    clearLocalLoggedIn();
  }

  global.BaziAuth = {
    AUTH_KEY,
    AUTH_EMAIL_KEY,
    syncFromSupabase,
    signOut,
    setLocalLoggedIn,
    clearLocalLoggedIn,
  };
})(window);

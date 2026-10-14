// 出生地经度查询。浏览器在大陆常常连不上 Nominatim，改由服务器代查。
// 只在保存档案时调用，遵守公开接口约每秒 1 次的限制。

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'ElementaWall/1.0 (birthplace geocode; https://elementawall.com)';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const q = String(req.query?.q || '').trim();
  const country = String(req.query?.country || '').trim().toLowerCase();
  if (!q || q.length > 120 || !/^[a-z]{2}$/.test(country)) {
    return res.status(400).json({ lon: null });
  }

  const url = new URL(NOMINATIM);
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', country);

  try {
    const upstream = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'zh,en',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!upstream.ok) return res.status(200).json({ lon: null });
    const data = await upstream.json();
    const lon = Array.isArray(data) && data.length > 0 ? parseFloat(data[0].lon) : NaN;
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).json({ lon: Number.isFinite(lon) ? lon : null });
  } catch (_) {
    return res.status(200).json({ lon: null });
  }
}

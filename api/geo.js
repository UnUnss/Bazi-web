export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const country = String(req.headers['x-vercel-ip-country'] || '').toUpperCase();
  const host = String(req.headers.host || '');
  const local = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  const mainland = country === 'CN' || (local && !country);

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ country, mainland });
}

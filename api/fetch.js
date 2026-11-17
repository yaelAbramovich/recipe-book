// Optional Vercel serverless function: fetches a recipe page server-side so the PWA can read it (no CORS).
// Deploy the project on Vercel and the app will use /api/fetch automatically.
const dns = require('node:dns').promises;
const net = require('node:net');

function isPrivate(ip) {
  if (net.isIPv6(ip)) return ip === '::1' || /^f[cd]/i.test(ip) || /^fe80/i.test(ip) || /^::ffff:(10|127|169\.254|192\.168|172\.(1[6-9]|2\d|3[01]))\./i.test(ip);
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const target = (req.query && req.query.url) || '';
  let u;
  try { u = new URL(target); } catch (_) { return res.status(400).send('bad url'); }
  if (!/^https?:$/.test(u.protocol)) return res.status(400).send('bad protocol');
  try {
    const addrs = await dns.lookup(u.hostname, { all: true });
    if (!addrs.length || addrs.some((a) => isPrivate(a.address))) return res.status(400).send('blocked host');
  } catch (_) { return res.status(400).send('dns error'); }

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10000);
  try {
    const r = await fetch(u, {
      signal: ctl.signal, redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; RecipeBookPWA/1.0)', accept: 'text/html,application/xhtml+xml', 'accept-language': 'he,en;q=0.8' },
    });
    const type = r.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml/.test(type)) return res.status(415).send('not html');
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 3_000_000) return res.status(413).send('too large');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(r.status).send(buf.toString('utf8'));
  } catch (_) {
    res.status(502).send('fetch failed');
  } finally { clearTimeout(timer); }
};

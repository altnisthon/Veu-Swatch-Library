export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return new Response(JSON.stringify({ error: 'Storage not configured' }), { status: 500 });

  try {
    const { swatches } = await req.json();
    if (!Array.isArray(swatches)) return new Response(JSON.stringify({ error: 'Invalid data' }), { status: 400 });

    await fetch(`${url}/set/veu_sw_v1`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(JSON.stringify(swatches)),
    });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('swatches-set error:', err);
    return new Response(JSON.stringify({ error: 'Save failed' }), { status: 500 });
  }
}

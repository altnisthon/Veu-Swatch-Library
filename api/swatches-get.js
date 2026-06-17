export const config = { runtime: 'edge' };

export default async function handler(req) {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });

  try {
    const res  = await fetch(`${url}/get/veu_sw_v1`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    const swatches = data.result ? JSON.parse(data.result) : [];
    return new Response(JSON.stringify(swatches), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('swatches-get error:', err);
    return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
}

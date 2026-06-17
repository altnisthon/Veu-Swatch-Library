export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    });
  }

  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return new Response(JSON.stringify({ error: 'Storage not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const { swatches } = body;
  if (!Array.isArray(swatches)) {
    return new Response(JSON.stringify({ error: 'swatches must be an array' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const res = await fetch(`${url}/set/veu_sw_v1`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(JSON.stringify(swatches)), // Upstash SET expects the value as JSON body
    });
    const data = await res.json();
    return new Response(JSON.stringify({ ok: true, result: data.result }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('swatches-set error:', err);
    return new Response(JSON.stringify({ error: 'Failed to save swatches' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}

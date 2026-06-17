export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { hex, hsl, productType } = body;

  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
    return new Response(JSON.stringify({ error: 'Invalid hex colour' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const [h, s, l] = hsl || [0, 0, 50];
  const productLabel = productType ? ` used as a ${productType.toLowerCase()} product` : '';

  const prompt = `You are a PCCS seasonal colour analysis expert for a beauty brand called VEU Alchemist.

Analyse this makeup shade${productLabel}:
- Hex: ${hex}
- Hue: ${Math.round(h)}°
- Saturation: ${Math.round(s)}%
- Lightness: ${Math.round(l)}%

The 8 PCCS seasons are: Spring Light, Spring Bright, Summer Light, Summer Mute, Autumn Mute, Autumn Deep, Winter Bright, Winter Dark.

Respond ONLY with a valid JSON object. No preamble, no explanation, no markdown. Exactly this shape:
{
  "season": "<one of the 8 seasons>",
  "undertone": "<Warm or Cool>",
  "value": "<Light, Medium, or Deep>",
  "chroma": "<Vivid, Muted, or Soft>",
  "why": "<1–2 sentences max, second-person, conversational, no em dashes, why this shade suits this season. Start with the shade characteristic, not 'You'.>",
  "tip": "<1 sentence max, how to wear or apply this shade for this season type. Practical, specific.>"
}`;

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text();
      console.error('Anthropic error:', err);
      return new Response(JSON.stringify({ error: 'Upstream API error' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await anthropicRes.json();
    const raw = data?.content?.[0]?.text || '';

    // Strip any accidental markdown fences
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=86400', // cache identical hex calls for 24h
      },
    });
  } catch (err) {
    console.error('Handler error:', err);
    return new Response(JSON.stringify({ error: 'Analysis failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

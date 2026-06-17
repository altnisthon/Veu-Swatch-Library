export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'API key not configured' }), { status: 500 });

  try {
    const { hex, brand, productName, shadeName, category } = await req.json();

    const prompt = `You are VEU Alchemist's colour analysis expert. Analyse this makeup swatch.
Hex: ${hex}
Product: ${brand} ${productName} shade ${shadeName}
Category: ${category}
8 seasons: Spring Light, Spring Bright, Summer Light, Summer Mute, Autumn Mute, Autumn Deep, Winter Bright, Winter Dark.
Respond ONLY in this exact JSON (no markdown, no preamble):
{"season":"Season Name","undertone":"Warm/Cool/Neutral","value":"Light/Medium/Deep","chroma":"Vivid/Muted","reason":"2-3 sentences explaining why this shade suits that season referencing its colour properties","confidence":"High/Medium/Low"}`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 500, messages: [{ role: 'user', content: prompt }] }),
    });

    const data = await res.json();
    const text = data.content?.find(b => b.type === 'text')?.text || '{}';
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    return new Response(JSON.stringify(parsed), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('analyse-swatch error:', err);
    return new Response(JSON.stringify({ error: 'Analysis failed' }), { status: 500 });
  }
}

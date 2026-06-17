export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'API key not configured' }), { status: 500 });
  try {
    const { hexList, brand, productName } = await req.json();
    const hexLines = hexList.map((h, i) => `Shade ${i + 1}: ${h}`).join('\n');
    const prompt = `You are VEU Alchemist's colour analysis expert. Analyse this eyeshadow palette with multiple shades.\nProduct: ${brand} ${productName}\nShades detected:\n${hexLines}\n\n8 seasons: Spring Light, Spring Bright, Summer Light, Summer Mute, Autumn Mute, Autumn Deep, Winter Bright, Winter Dark.\n\nFor each shade, classify it to its best season. Then tally the seasons and pick the dominant one (most votes). Respond ONLY in this exact JSON (no markdown, no preamble):\n{"shades":[{"hex":"#xxxxxx","season":"Season Name","label":"1-3 word shade description e.g. warm terracotta"}],"dominantSeason":"Season Name","seasonTally":{"Spring Light":0,"Spring Bright":0,"Summer Light":0,"Summer Mute":0,"Autumn Mute":0,"Autumn Deep":0,"Winter Bright":0,"Winter Dark":0},"reason":"2-3 sentences about what makes this palette suited to the dominant season","confidence":"High/Medium/Low"}`;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 900, messages: [{ role: 'user', content: prompt }] }),
    });
    const data = await res.json();
    const text = data.content?.find(b => b.type === 'text')?.text || '{}';
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    return new Response(JSON.stringify(parsed), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('analyse-palette error:', err);
    return new Response(JSON.stringify({ error: 'Analysis failed' }), { status: 500 });
  }
}

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  return new Response(JSON.stringify({
    upstash_url:   url   ? '✓ set' : '✗ missing',
    upstash_token: token ? '✓ set' : '✗ missing',
    anthropic_key: apiKey? '✓ set' : '✗ missing',
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── OpenAI Proxy (Cloudflare Pages Function) ─────────────────────────────────
// The OPENAI_API_KEY lives only here as a Cloudflare secret.
// It is NEVER sent to the browser — the client calls /api/chat instead.
//
// Auth is already enforced by functions/_middleware.js on every route,
// so only authenticated users can reach this endpoint.
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_MODELS = ['gpt-4o', 'gpt-4o-mini'];
const MAX_TOKENS_CAP = 4000;

export async function onRequestPost(context) {
  const { request, env } = context;

  // Ensure API key is configured
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    return json({ error: 'OpenAI API key not configured on the server.' }, 500);
  }

  // Parse request body
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const { messages, temperature = 0.7, max_tokens = 1000 } = body;

  // Basic validation
  if (!Array.isArray(messages) || messages.length === 0) {
    return json({ error: 'messages must be a non-empty array.' }, 400);
  }

  // Sanitise params — never trust the client
  const safeTemp   = Math.min(Math.max(Number(temperature)  || 0.7,  0), 2);
  const safeTokens = Math.min(Math.max(Number(max_tokens)   || 1000, 1), MAX_TOKENS_CAP);

  // Forward to OpenAI
  let openAIRes;
  try {
    openAIRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages,
        temperature: safeTemp,
        max_tokens: safeTokens,
      }),
    });
  } catch (err) {
    return json({ error: 'Failed to reach OpenAI.' }, 502);
  }

  if (!openAIRes.ok) {
    const errText = await openAIRes.text();
    // Forward OpenAI's status but never expose the key
    return new Response(errText, {
      status: openAIRes.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const data = await openAIRes.json();
  return json(data, 200);
}

// Reject non-POST requests
export async function onRequestGet() {
  return json({ error: 'Method not allowed.' }, 405);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

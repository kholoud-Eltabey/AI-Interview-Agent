export async function onRequestPost(context) {
  const { request, env } = context;

  const apiKey = env.OPENAI_API_KEY;
  console.log('[chat] API key exists:', !!apiKey, '| length:', apiKey ? apiKey.length : 0);

  if (!apiKey) {
    return json({ error: 'OpenAI API key not configured.' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON.' }, 400);
  }

  const { messages, temperature = 0.7, max_tokens = 1000 } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return json({ error: 'messages required.' }, 400);
  }

  const model = 'gpt-4.5-preview';
  const payload = {
    model,
    messages,
    temperature: Math.min(Math.max(Number(temperature) || 0.7, 0), 2),
    max_tokens: Math.min(Number(max_tokens) || 1000, 4000),
  };

  console.log('[chat] model:', model, '| messages:', messages.length, '| temp:', payload.temperature);

  let res;
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('[chat] fetch error:', err.message);
    return json({ error: 'Failed to reach OpenAI.' }, 502);
  }

  console.log('[chat] OpenAI status:', res.status);

  if (!res.ok) {
    const errText = await res.text();
    console.error('[chat] OpenAI error:', res.status, errText.slice(0, 500));
    return new Response(errText, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const data = await res.json();
  return json(data, 200);
}

export async function onRequestGet() {
  return json({ error: 'Method not allowed.' }, 405);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

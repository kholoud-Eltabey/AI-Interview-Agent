// ── /api/interviews ────────────────────────────────────────────────────────
// Cloudflare KV-backed interview storage.
// All interviews stored under key "skoon_interviews" as a JSON array.
// ──────────────────────────────────────────────────────────────────────────

const KV_KEY = 'skoon_interviews';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

async function getAll(kv) {
  const raw = await kv.get(KV_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function saveAll(kv, list) {
  await kv.put(KV_KEY, JSON.stringify(list));
}

// GET /api/interviews
export async function onRequestGet(context) {
  const { env } = context;
  if (!env.SKOON_INTERVIEWS) return json({ error: 'KV not configured.' }, 500);
  const list = await getAll(env.SKOON_INTERVIEWS);
  return json(list);
}

// POST /api/interviews  — save or update one interview
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.SKOON_INTERVIEWS) return json({ error: 'KV not configured.' }, 500);

  let interview;
  try { interview = await request.json(); } catch { return json({ error: 'Invalid JSON.' }, 400); }
  if (!interview || !interview.id) return json({ error: 'interview.id required.' }, 400);

  const list = await getAll(env.SKOON_INTERVIEWS);
  const idx  = list.findIndex(iv => iv.id === interview.id);
  if (idx >= 0) list[idx] = interview;          // update existing
  else list.push(interview);                     // insert new

  await saveAll(env.SKOON_INTERVIEWS, list);
  return json({ ok: true, id: interview.id });
}

// DELETE /api/interviews?id=xxx  — remove one interview by id
export async function onRequestDelete(context) {
  const { request, env } = context;
  if (!env.SKOON_INTERVIEWS) return json({ error: 'KV not configured.' }, 500);

  const url = new URL(request.url);
  const id  = url.searchParams.get('id');
  if (!id) return json({ error: 'id query param required.' }, 400);

  const list    = await getAll(env.SKOON_INTERVIEWS);
  const trimmed = list.filter(iv => iv.id !== id);

  if (trimmed.length === list.length) return json({ ok: true, deleted: false }); // not found — no-op
  await saveAll(env.SKOON_INTERVIEWS, trimmed);
  return json({ ok: true, deleted: true, id });
}

// OPTIONS — CORS preflight
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

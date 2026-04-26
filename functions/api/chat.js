// ─── /api/chat — Cloudflare Pages Function ────────────────
// Holds OpenAI key server-side, proxies chat completions with:
//   • CORS allowlist: pages.dev + localhost:4000 (for local dev)
//   • Always-available models (no preview-tier gated models)
//   • Fallback chain on 403/404/model_not_found/timeout
//   • 45s abort timeout per model attempt
//   • Structured JSON errors with status + code + human message
//   • Full server-side logging for debugging

const PRIMARY_MODEL  = 'gpt-4o';
const FALLBACK_MODEL = 'gpt-4o-mini';
const MODEL_CHAIN    = [PRIMARY_MODEL, FALLBACK_MODEL];
const REQUEST_TIMEOUT_MS = 45_000;

// ─── CORS ─────────────────────────────────────────────────
// Allow the production deployment and local dev origins.
// The OpenAI key is never sent to the browser — it lives in env.OPENAI_API_KEY.
// CORS only controls which browser origins may call this endpoint;
// server-to-server calls (curl, etc.) bypass CORS entirely.
const ALLOWED_ORIGINS = new Set([
  'https://skoon-interview-agent.pages.dev',
  'http://localhost:4000',
  'http://127.0.0.1:4000',
]);

function corsHeaders(request) {
  const origin = (request && request.headers.get('Origin')) || '';
  // Echo back the exact origin if it's in the allowlist so browsers accept it.
  // Fall back to the production origin for same-origin requests (no Origin header).
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : 'https://skoon-interview-agent.pages.dev';
  return {
    'Access-Control-Allow-Origin':  allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

// ─── OPTIONS preflight ────────────────────────────────────
export async function onRequestOptions(context) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(context.request),
  });
}

// ─── POST /api/chat ───────────────────────────────────────
export async function onRequestPost(context) {
  const { request, env } = context;
  const cors = corsHeaders(request);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonErr(400, 'bad_json', 'Invalid JSON in request body.', cors);
  }

  // API key lives ONLY in env.OPENAI_API_KEY — never accepted from the client.
  const { messages, temperature = 0.7, max_tokens = 1000 } = body;
  const apiKey = env.OPENAI_API_KEY;

  console.log('[chat] key exists:', !!apiKey);

  if (!apiKey) {
    return jsonErr(500, 'config_missing', 'OpenAI API key not configured on the server.', cors);
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return jsonErr(400, 'bad_request', '`messages` must be a non-empty array.', cors);
  }

  const basePayload = {
    messages,
    temperature: Math.min(Math.max(Number(temperature) || 0.7, 0), 2),
    max_tokens: Math.min(Number(max_tokens) || 1000, 4000),
  };

  // Track the last real error so we can return something meaningful if every
  // model fails. If the first model succeeds we never look at this.
  let lastFailure = null;

  for (const model of MODEL_CHAIN) {
    const payload = { ...basePayload, model };
    console.log(
      '[chat] attempt model:', model,
      '| messages:', messages.length,
      '| temp:', payload.temperature,
      '| max_tokens:', payload.max_tokens
    );

    const attempt = await callOpenAI(payload, apiKey);

    if (attempt.ok) {
      // Success — return OpenAI body straight through with CORS headers
      console.log('[chat] success with', model, '| status:', attempt.status);
      return new Response(attempt.bodyText, {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    // Failed — decide whether to fall back or surface immediately
    lastFailure = { ...attempt, model };
    console.error(
      '[chat] attempt failed:',
      'model=', model,
      '| kind=', attempt.kind,
      '| status=', attempt.status,
      '| code=', attempt.code,
      '| message=', (attempt.message || '').slice(0, 300)
    );

    if (!shouldFallback(attempt)) {
      // Don't mask auth, rate-limit, or true server errors by retrying
      console.log('[chat] not a fallback-eligible error — returning to client');
      return jsonErrFromAttempt(attempt, cors);
    }
    console.log('[chat] falling back to next model in chain…');
  }

  // Every model in the chain failed
  console.error('[chat] all models exhausted. last failure:', lastFailure);
  return jsonErrFromAttempt(
    lastFailure || { status: 502, kind: 'unknown', code: 'no_model', message: 'No model responded.' },
    cors
  );
}

export async function onRequestGet(context) {
  return jsonErr(405, 'method_not_allowed', 'Method not allowed. Use POST.', corsHeaders(context.request));
}

// ─── OpenAI call with timeout + normalised result ─────────
async function callOpenAI(payload, apiKey) {
  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    clearTimeout(timeoutId);

    const bodyText = await res.text();

    if (res.ok) {
      return { ok: true, status: res.status, bodyText };
    }

    // Extract the real error code/message from OpenAI's response
    let code = `http_${res.status}`;
    let message = `OpenAI returned HTTP ${res.status}`;
    try {
      const j = JSON.parse(bodyText);
      if (j && j.error) {
        if (j.error.code)    code    = j.error.code;
        if (j.error.message) message = j.error.message;
        else if (typeof j.error === 'string') message = j.error;
      }
    } catch (_) { /* non-JSON body — keep defaults */ }

    return {
      ok: false,
      kind: 'http',
      status: res.status,
      code,
      message,
      bodyText,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    const isAbort = err && (err.name === 'AbortError' || /abort/i.test(err.message || ''));
    return {
      ok: false,
      kind: isAbort ? 'timeout' : 'network',
      status: isAbort ? 504 : 502,
      code: isAbort ? 'timeout' : 'network_error',
      message: isAbort
        ? `OpenAI request timed out after ${REQUEST_TIMEOUT_MS / 1000}s.`
        : `Could not reach OpenAI: ${err.message || 'unknown network error'}`,
      bodyText: '',
    };
  }
}

// Which errors are worth retrying with a different model.
// Everything else (401 auth, 429 rate limit, 400 bad request, 5xx from OpenAI)
// is a real problem — surface it instead of masking with a fallback.
function shouldFallback(attempt) {
  if (!attempt || attempt.ok) return false;
  if (attempt.kind === 'timeout') return true;
  if (attempt.kind === 'network') return true;
  if (attempt.status === 404) return true;
  if (attempt.status === 403) return true;
  const code = (attempt.code || '').toLowerCase();
  const msg  = (attempt.message || '').toLowerCase();
  if (code === 'model_not_found') return true;
  if (/model.*not.*found|do(es)? not have access|does not exist/.test(msg)) return true;
  return false;
}

// ─── JSON error helpers ───────────────────────────────────
function jsonErr(status, code, message, extraHeaders = {}) {
  return new Response(
    JSON.stringify({ error: { code, message, status } }),
    { status, headers: { 'Content-Type': 'application/json', ...extraHeaders } }
  );
}

function jsonErrFromAttempt(a, extraHeaders = {}) {
  // If OpenAI returned a JSON body, pass it through so the frontend can show the raw detail.
  if (a.bodyText) {
    try {
      const parsed = JSON.parse(a.bodyText);
      if (parsed && parsed.error) {
        return new Response(
          JSON.stringify({
            error: {
              code:    a.code    || parsed.error.code    || 'upstream_error',
              message: a.message || parsed.error.message || 'Upstream error.',
              status:  a.status  || 502,
              model:   a.model,
              kind:    a.kind,
            },
          }),
          { status: a.status || 502, headers: { 'Content-Type': 'application/json', ...extraHeaders } }
        );
      }
    } catch (_) { /* fall through */ }
  }
  return new Response(
    JSON.stringify({
      error: {
        code:    a.code    || 'upstream_error',
        message: a.message || 'Upstream error.',
        status:  a.status  || 502,
        model:   a.model,
        kind:    a.kind,
      },
    }),
    { status: a.status || 502, headers: { 'Content-Type': 'application/json', ...extraHeaders } }
  );
}

// ─── Skoon Auth Middleware (Cloudflare Pages Functions) ───────────────────────
// Anyone can enter any name — only the password is checked.
// The name they type is stored in the session and passed to the app.
//
// Env vars (set in Cloudflare Pages → Settings → Environment variables):
//   AUTH_PASSWORD  — shared password for all users
//   JWT_SECRET     — random signing secret (openssl rand -hex 32)
// ─────────────────────────────────────────────────────────────────────────────

const COOKIE_NAME    = 'skoon_auth';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days
const LOGIN_PATH     = '/login';

// ── Crypto helpers ─────────────────────────────────────────────────────────────

async function hmacSign(value, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(value));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `${value}.${b64}`;
}

async function hmacVerify(token, secret) {
  try {
    const dot = token.lastIndexOf('.');
    if (dot === -1) return false;
    const value    = token.slice(0, dot);
    const expected = await hmacSign(value, secret);
    return token === expected;
  } catch { return false; }
}

function getCookie(request, name) {
  const cookies = request.headers.get('Cookie') || '';
  const match   = cookies.split(';').map(c => c.trim())
    .find(c => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

// Extract the name stored inside the token (format: "name:timestamp.sig")
function nameFromToken(token) {
  try {
    const payload = token.slice(0, token.lastIndexOf('.'));
    return payload.split(':')[0] || '';
  } catch { return ''; }
}

// ── Login page ─────────────────────────────────────────────────────────────────

function loginHTML(errorMsg = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Skoon — Sign In</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    background: #F7F7FA; color: #2C2B3B;
    display: flex; align-items: center; justify-content: center;
    min-height: 100vh; padding: 24px;
  }
  .card {
    background: #fff; border-radius: 16px; padding: 40px 36px;
    width: 100%; max-width: 360px;
    box-shadow: 0 1px 3px rgba(0,0,0,.05), 0 8px 32px rgba(0,0,0,.07);
  }
  .brand { font-size: 20px; font-weight: 700; color: #0B5E57; margin-bottom: 4px; }
  .sub   { font-size: 13px; color: #6B7280; margin-bottom: 28px; }
  label  {
    display: block; font-size: 11px; font-weight: 600;
    color: #6B7280; text-transform: uppercase; letter-spacing: .7px; margin-bottom: 6px;
  }
  input {
    width: 100%; padding: 10px 13px; font-size: 14px;
    border: 1.5px solid #ECECF2; border-radius: 8px;
    background: #F7F7FA; color: #2C2B3B;
    outline: none; margin-bottom: 16px; font-family: inherit;
    transition: border-color .18s, box-shadow .18s;
  }
  input:focus { border-color: #0B5E57; box-shadow: 0 0 0 3px rgba(11,94,87,.08); background: #fff; }
  button {
    width: 100%; padding: 12px; background: #0B5E57; color: #fff;
    border: none; border-radius: 8px; font-size: 14px; font-weight: 600;
    cursor: pointer; font-family: inherit; transition: background .18s;
  }
  button:hover { background: #094D47; }
  .err {
    font-size: 12px; color: #DC2626; background: #FEF2F2;
    border: 1px solid #FECACA; border-radius: 6px;
    padding: 8px 12px; margin-bottom: 16px;
  }
</style>
</head>
<body>
  <div class="card">
    <div class="brand">Skoon</div>
    <div class="sub">Research Dashboard — Sign in to continue</div>
    ${errorMsg ? `<div class="err">${errorMsg}</div>` : ''}
    <form method="POST" action="${LOGIN_PATH}">
      <label>Your Name</label>
      <input type="text" name="username" autocomplete="name" placeholder="e.g. Ahmed" required autofocus />
      <label>Password</label>
      <input type="password" name="password" autocomplete="current-password" required />
      <button type="submit">Sign In</button>
    </form>
  </div>
</body>
</html>`;
}

// ── Middleware entry point ──────────────────────────────────────────────────────

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  const SECRET    = env.JWT_SECRET    || 'REPLACE_JWT_SECRET_IN_CLOUDFLARE';
  const AUTH_PASS = env.AUTH_PASSWORD || 'REPLACE_PASSWORD_IN_CLOUDFLARE';

  // ── GET /login
  if (url.pathname === LOGIN_PATH && request.method === 'GET') {
    return new Response(loginHTML(), {
      headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
  }

  // ── POST /login — only password is validated; name is free
  if (url.pathname === LOGIN_PATH && request.method === 'POST') {
    let username = '', password = '';
    const ct = request.headers.get('Content-Type') || '';
    if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
      const body = await request.formData();
      username = (body.get('username') || '').trim();
      password = (body.get('password') || '').trim();
    } else {
      const body = await request.json().catch(() => ({}));
      username = (body.username || '').trim();
      password = (body.password || '').trim();
    }

    if (!username) {
      return new Response(loginHTML('Please enter your name.'), {
        status: 400, headers: { 'Content-Type': 'text/html;charset=UTF-8' }
      });
    }

    if (password === AUTH_PASS) {
      // Store name:timestamp in the token
      const payload = `${encodeURIComponent(username)}:${Date.now()}`;
      const token   = await hmacSign(payload, SECRET);
      return new Response(null, {
        status: 302,
        headers: {
          'Location': '/',
          'Set-Cookie': [
            `${COOKIE_NAME}=${encodeURIComponent(token)}`,
            'Path=/',
            'HttpOnly',
            'Secure',
            'SameSite=Lax',
            `Max-Age=${COOKIE_MAX_AGE}`
          ].join('; ')
        }
      });
    }

    return new Response(loginHTML('Incorrect password. Please try again.'), {
      status: 401, headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
  }

  // ── GET /logout
  if (url.pathname === '/logout') {
    return new Response(null, {
      status: 302,
      headers: {
        'Location': LOGIN_PATH,
        'Set-Cookie': `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
      }
    });
  }

  // ── All other routes — verify cookie
  const token = getCookie(request, COOKIE_NAME);
  const valid  = token ? await hmacVerify(token, SECRET) : false;

  if (!valid) {
    return new Response(null, {
      status: 302,
      headers: { 'Location': LOGIN_PATH }
    });
  }

  // Attach the user's name as a header so /api/me can read it
  const name = decodeURIComponent(nameFromToken(token));
  const req2 = new Request(request, {
    headers: (() => {
      const h = new Headers(request.headers);
      h.set('X-Auth-User', name);
      return h;
    })()
  });

  return next(req2);
}

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**Skoon Interview Agent** — an AI-powered user interview tool for Skoon, a Saudi rental property platform.

| | |
|---|---|
| **Single file** | `index.html` — all HTML, CSS, and JS inline in one file |
| **No tooling** | No build step, no framework, no package.json, no dependencies |
| **AI model** | OpenAI GPT-4o — called via Cloudflare Worker (`/api/chat`) — key never in browser |
| **Languages** | Gulf Arabic / English — switchable at any time |
| **Local dev** | `wrangler pages dev .` — required for `/api/chat` Worker to work locally |
| **Deploy** | `wrangler pages deploy . --project-name skoon-interview-agent --branch main` |

---

## Architecture

```
Browser (index.html)
    │
    └── POST /api/chat
            │
            └── functions/api/chat.js  (Cloudflare Pages Function)
                    │
                    └── OpenAI API  (key stored as Cloudflare secret)
```

- The OpenAI API key is stored **only** as a Cloudflare encrypted secret (`OPENAI_API_KEY`)
- The browser never sees the key — it calls `/api/chat` and the Worker calls OpenAI
- Auth middleware lives in `functions/_middleware.js` — HMAC-signed cookie, shared password

---

## 1. Four-Page Flow

The app renders one `<div class="page">` at a time, navigating via `goTo(pageId)`:

```
page-setup  →  page-prestart  →  page-chat  →  page-done      (regular user)
                                            ↘  page-results   (researcher only, via triple-click)
```

| Page | ID | Purpose |
|------|----|---------|
| Setup | `page-setup` | Landing page — interview config (goal, audience). API shows "Connected" read-only. |
| Pre-start | `page-prestart` | Warm-up / heads-up page shown before the interview starts |
| Chat | `page-chat` | Live interview conversation — question and answer |
| Done | `page-done` | Thank-you screen shown to regular users after interview ends |
| Results | `page-results` | Researcher analysis dashboard — accessed only via triple-click |

**Navigation rules:**
- `page-setup` is the active landing page (has `class="page active"` in HTML)
- Setup "Start Interview" button → `goTo('page-prestart')`
- Pre-start "Start Interview" button → `startInterview()` → `goTo('page-chat')`
- Pre-start Back button → `goTo('page-setup')`
- `goHome()` and `restart()` both return to `page-setup`
- `concludeInterview()` always calls `finishMsg()` → `goTo('page-done')` — never shows analysis to users

---

## 2. State Object `S`

Single source of truth for all runtime state:

```js
const S = {
  lang: 'en',            // current language: 'en' or 'ar'
  theme: 'light',        // 'light' or 'dark'
  apiKey: '',            // unused — key is server-side only
  numQ: 10,              // number of questions (fixed at 10)
  goal: '',              // interview goal (set by researcher on setup page)
  audience: '',          // target audience description
  biz: 'Skoon',          // product name
  msgs: [],              // full conversation message history
  mainAsked: 0,          // number of main questions asked so far
  followUps: 0,          // number of follow-up questions asked
  maxFollowUps: 0,
  waitingForAnswer: false,
  done: false,
  isResearcher: localStorage.getItem('researcher_access') === 'true',
  _iid: undefined,       // unique interview ID — set at startInterview()
};
```

---

## 3. Translations `TR` / `t()`

**Golden rule:** every string visible to the user must go through `t('key')` — never hardcode text in render functions.

- All strings live in the `TR` object with `TR.en` and `TR.ar` sub-objects
- `t('key')` reads `TR[S.lang][key]` automatically
- When adding any new string → add it to **both languages** at the same time

---

## 4. localStorage Keys

| Key | Stores |
|-----|--------|
| `skoon_theme` | Selected theme (`light` / `dark`) |
| `skoon_lang` | Selected language (`en` / `ar`) |
| `researcher_access` | `'true'` when researcher passcode has been entered |
| `skoon_session` | In-progress interview (JSON) — cleared on completion |
| `skoon_interviews` | Append-only array of all completed interviews — never deleted |

> `skoon_api_key` is no longer used. The key lives server-side only.

---

## 5. Interview Persistence

Every completed interview is appended to `skoon_interviews` — **nothing is ever deleted or overwritten.**

```js
// Shape of each saved record
{
  id,                    // unique ID (S._iid)
  num,                   // sequential interview number (1-based)
  date,                  // ISO date string
  lang,                  // language at interview time
  completed,             // always true
  goal,                  // interview goal
  audience,              // target audience
  lastQuestionSeen,      // S.mainAsked at save time
  totalQuestions,        // S.numQ
  progressPercent,       // percentage complete
  keyNotes,              // summary string (from analysis, if available)
  answers: [{ q, a }],  // every question paired with its answer
  analysis: null | {...} // GPT-4o results (researcher only)
}
```

- `saveInterview(analysis)` checks `S._iid` before saving to prevent duplicates
- `extractQA()` pulls question/answer pairs out of `S.msgs`
- `renderAnalysis(d, iv)` receives the full record as `iv` — `iv.lastQuestionSeen / iv.totalQuestions` renders progress bar at top of analysis

---

## 6. Researcher Access (Hidden)

Regular users see no admin UI — access is completely hidden from the DOM.

**How to access:**
1. **Triple-click** the "Skoon" brand name in the topbar (3 consecutive clicks within 600 ms)
2. A passcode modal appears
3. Enter `1589`
4. Researcher dashboard opens

**Rules — do not change:**
- Triple-click is the ONLY trigger — no other path, no shortcuts, no URL params
- 1 or 2 clicks do nothing; counter resets if interrupted
- `isResearcher` flag enables 5 extra analysis sections (Personas, Empathy Map, Journey, Impact/Effort, User Flow)
- These sections are never added to the DOM for regular users — not CSS-hidden, simply never rendered

---

## 7. Analysis Pipeline

```
concludeInterview()
    │
    └── finishMsg()  →  saveInterview(null)  →  goTo('page-done')
                        (always — no analysis shown to regular users)

Researcher triggers analysis manually from dashboard:
    analyzeStoredInterview(id)  →  callAI(...)  →  renderAnalysis(data, iv)
```

**Important:**
- `renderResults()` = page navigation + dashboard scaffold
- `renderAnalysis()` = analysis content only, injected into `#res-content`
- When switching between past interviews → call `renderAnalysis()` alone, not `renderResults()`

---

## 8. API Call — `callAI(messages, temp, maxTok)`

All OpenAI requests go through the Cloudflare Worker:

```js
async function callAI(messages, temp = 0.85, maxTok = 700) {
  const res = await fetch('/api/chat', { method: 'POST', ... });
  // logs status + response body to console on failure
  // throws on non-OK — caller's catch block shows errAi string
}
```

- On network error: logs to console, throws `'Network error — could not reach /api/chat'`
- On non-OK HTTP: logs `status` + first 400 chars of body, throws parsed error message
- **After an error in `askQuestion`**: `S.waitingForAnswer` is reset to `true` so the user can retry

---

## 9. RTL / Bilingual Layout

- `[dir="rtl"]` on `<html>` controls layout direction globally
- **Always use CSS logical properties:**
  - ✅ `margin-inline-start` / `padding-inline-end` / `border-inline-start`
  - ❌ `margin-left` / `padding-right`
- Arabic font: `IBM Plex Sans Arabic` — English font: `IBM Plex Sans`
- `cycleLang()` toggles `S.lang`, updates the `dir` attribute, re-renders the current page

---

## 10. Interview System Prompt `buildSys()`

The AI plays the role of a **friendly, curious conversation partner** — not a formal researcher.

Built once in `startInterview()` and pushed as `{ role: 'system' }` into `S.msgs`.

**Q1:** No greeting or preamble — jump straight into the first question.

**Q2+:** Start every question with a short natural acknowledgment phrase (1-3 words):
- EN: `"Interesting,"` / `"Got it,"` / `"Makes sense,"` / `"Okay,"` / `"Oh nice,"`
- AR: `"آه واضح،"` / `"طيب،"` / `"ما شاء الله،"` / `"فاهم،"`
- Rotate — never repeat the same phrase twice in a row

**Strict rules:**
- One question per message — never combine two
- Open-ended only — never yes/no
- One short sentence, under 15 words
- Build on what the user just said
- Cover new topics — never repeat

**Arabic:** Gulf/Saudi dialect only — never Egyptian dialect

---

## 11. Analysis Prompt `analyzeStoredInterview()`

Called by researchers from the dashboard. Passes the full Q&A to GPT-4o, expects JSON only.

- `temperature: 0.2` — `max_tokens: 3000`
- Output must be **valid JSON only** — no text outside the JSON block

**10 required fields:** `summary`, `insights`, `quotes`, `patterns`, `recommendations`, `personas`, `empathy`, `journey`, `impactEffort`, `userFlow`

**Fixed enum values — always in English, even in Arabic mode:**
- `sentiment`: `positive` / `neutral` / `negative`
- `impact` / `effort`: `High` / `Medium` / `Low`
- `priority`: `Do First` / `Schedule` / `Delegate` / `Drop`

---

## 12. Local Development

```bash
# 1. Copy secrets file
cp .dev.vars.example .dev.vars
# Edit .dev.vars — add real OPENAI_API_KEY, AUTH_PASSWORD, JWT_SECRET

# 2. Start local dev server (runs Workers + static files)
wrangler pages dev .
```

`npx serve .` does NOT work for full testing — it has no Functions support, so `/api/chat` returns 404.

---

## 13. Deployment

```bash
# Deploy to Cloudflare Pages
wrangler pages deploy . --project-name skoon-interview-agent --branch main

# Update OpenAI API key secret
wrangler pages secret put OPENAI_API_KEY --project-name skoon-interview-agent

# Auto-deploy: every push to GitHub master triggers deploy via GitHub Actions
# Requires CLOUDFLARE_API_TOKEN secret in GitHub repo settings
```

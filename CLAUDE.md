# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**Skoon Interview Agent** — an AI-powered user interview tool for Skoon, a Saudi rental property platform.

| | |
|---|---|
| **Single file** | `index.html` — all HTML, CSS, and JS inline in one file |
| **No tooling** | No build step, no framework, no package.json, no dependencies |
| **AI model** | OpenAI GPT-4o — called directly from the browser |
| **Languages** | Gulf Arabic / English — switchable at any time |
| **Run** | Open `index.html` directly in a browser, or `npx serve .` |

---

## 1. Four-Page Flow

The app renders one `<div class="page">` at a time, navigating via `goTo(pageId)`:

```
page-setup  →  page-chat  →  page-results  (researcher only)
                          ↘  page-done      (regular user)
```

| Page | ID | Purpose |
|------|----|---------|
| Setup | `page-setup` | API key entry + interview config (goal, audience, question count) |
| Chat | `page-chat` | Live interview conversation — question and answer |
| Results | `page-results` | Researcher analysis dashboard — passcode protected |
| Done | `page-done` | Thank-you screen shown to regular users after interview ends |

---

## 2. State Object `S`

Single source of truth for all runtime state:

```js
const S = {
  lang: 'en',            // current language: 'en' or 'ar'
  theme: 'light',        // 'light' or 'dark'
  apiKey: '',            // OpenAI API key
  numQ: 10,              // number of questions requested
  goal: '',              // interview goal (set by researcher)
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

All app data is saved in the browser — no server, no database.

| Key | Stores |
|-----|--------|
| `skoon_api_key` | OpenAI API key |
| `skoon_theme` | Selected theme (`light` / `dark`) |
| `skoon_lang` | Selected language (`en` / `ar`) |
| `researcher_access` | `'true'` when researcher passcode has been entered |
| `skoon_session` | In-progress interview (JSON) — cleared on completion |
| `skoon_interviews` | Append-only array of all completed interviews — never deleted |

---

## 5. Interview Persistence

Every completed interview is appended to `skoon_interviews` — **nothing is ever deleted or overwritten.**

```js
// Shape of each saved record
{
  id,           // unique ID (S._iid)
  date,         // ISO date string
  lang,         // language at interview time
  completed,    // always true
  goal,         // interview goal
  audience,     // target audience
  answers: [{ q, a }],   // every question paired with its answer
  analysis: null | {...}  // GPT-4o results (researcher only)
}
```

- `saveInterview(analysis)` checks `S._iid` before saving to prevent duplicates
- `extractQA()` pulls question/answer pairs out of `S.msgs`

---

## 6. Researcher Access (Hidden)

Regular users see no admin button — access is completely hidden.

**How to access:**
1. **Triple-click** the "Skoon" brand name in the topbar
2. A passcode modal appears
3. Enter `1589`
4. `renderResults({})` is called directly — researcher dashboard opens

**What researcher mode adds:**
- `renderHistory()` panel — all past interviews with stats
- 5 extra sections: Personas, Empathy Map, User Journey, Impact vs Effort, User Flow
- These sections are **never added to the DOM** for regular users — not CSS-hidden, simply never rendered

---

## 7. Analysis Pipeline

What happens after the interview ends depends on user type:

```
concludeInterview()
    │
    ├── isResearcher = true
    │       └── analyze()              ← sends conversation to GPT-4o
    │               └── renderResults(data)
    │                       ├── renderHistory(S._iid)   ← interview history panel
    │                       └── renderAnalysis(data)    ← analysis content
    │
    └── isResearcher = false
            └── finishMsg()            ← saves interview, shows page-done
```

**Important:**
- `renderResults()` = page navigation + history rendering
- `renderAnalysis()` = analysis content only, injected into `#res-content`
- When switching between past interviews → call `renderAnalysis()` alone, not `renderResults()`

---

## 8. RTL / Bilingual Layout

The app fully supports Arabic and English — everything flips with one click.

- `[dir="rtl"]` on `<html>` controls layout direction globally
- **Always use CSS logical properties** — never directional ones for layout:
  - ✅ `margin-inline-start` / `padding-inline-end` / `border-inline-start`
  - ❌ `margin-left` / `padding-right`
- Arabic font: `IBM Plex Sans Arabic` — English font: `IBM Plex Sans`
- `cycleLang()` toggles `S.lang`, updates the `dir` attribute, and re-renders the current page

---

## 9. Interview System Prompt `buildSys()`

The AI plays the role of a **friendly, curious conversation partner** — not a formal researcher — so the participant feels comfortable speaking openly.

Built once in `startInterview()` and pushed as `{ role: 'system' }` into `S.msgs`. Rebuilt in-place automatically when the user switches language mid-session.

**Topics the AI explores naturally through conversation:**
1. How the user currently searches for a rental property
2. What frustrates them most during the search
3. How they compare options and make choices
4. What makes them decide to reach out or commit
5. How much they trust photos and descriptions online
6. Their experience communicating with landlords or agents
7. What they wish was different about the whole experience
8. How they feel emotionally during the search

**Strict AI rules:**
- One question per message only — short sentence (under 15 words)
- Open-ended only — never yes/no
- Each question must build on what the user just said
- No praise, no commentary — just the next question

**English prompt persona:** `"You are a friendly, curious conversation partner..."`

**Arabic prompt persona:** `"أنت صديق محادث ودود..."` — Gulf/Saudi dialect, never Egyptian

---

## 10. Analysis Prompt `analyze()`

Sent after the interview ends, for researchers only. Passes the full conversation to GPT-4o and expects a JSON response.

- `temperature: 0.2` — `max_tokens: 3000`
- Output must be **valid JSON only** — no text outside the JSON block

**10 required fields:**

| Field | Contains |
|-------|----------|
| `summary` | 2-3 sentence overview of key findings |
| `insights` | Most important takeaways |
| `quotes` | Verbatim quotes from the participant |
| `patterns` | Recurring behaviours or attitudes |
| `recommendations` | Concrete, actionable product team actions |
| `personas` | 1-2 user personas derived from the interview |
| `empathy` | Empathy map: thinks / feels / says / does |
| `journey` | User journey phases with sentiment per phase |
| `impactEffort` | Recommendations ranked by impact and effort |
| `userFlow` | Sequential steps the user takes in their current flow |

**Fixed enum values — always in English, even in Arabic mode:**
- `sentiment`: `positive` / `neutral` / `negative`
- `impact` / `effort`: `High` / `Medium` / `Low`
- `priority`: `Do First` / `Schedule` / `Delegate` / `Drop`

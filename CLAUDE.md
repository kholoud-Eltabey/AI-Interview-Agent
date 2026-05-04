# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## ⚠️ Development Rules (MUST FOLLOW)

1. **Test locally after every change** — open `index.html` in a browser and verify the affected feature works before considering the task done
2. **Push to GitHub only after local validation** — never push unverified code
3. **Never break existing features** — before touching any function, check what else calls it; regression is not acceptable

**Checklist before any push:**
- [ ] Feature works in both English and Arabic (`cycleLang()` tested)
- [ ] Feature works in light and dark theme (`toggleTheme()` tested)
- [ ] Researcher mode works (triple-click brand → passcode → dashboard)
- [ ] Regular user flow works (setup → chat → done screen)
- [ ] No console errors

---

## Project Overview

**Almosafer Interview Agent** — an AI-powered user interview tool for Almosafer, a Saudi travel booking platform.

| | |
|---|---|
| **Single file** | `index.html` — all HTML, CSS, and JS inline in one file |
| **No tooling** | No build step, no framework, no package.json, no dependencies |
| **AI model** | OpenAI GPT-4o — proxied via Cloudflare Pages Function `/api/chat` (key never in browser) |
| **Languages** | Gulf Arabic / English — switchable at any time |
| **Run** | Open `index.html` directly in a browser, or `npx serve .` |

**Other files:**
- `_headers` — Cloudflare Pages cache-control headers (no-cache for `/` and `/index.html`)
- `functions/api/chat.js` — Cloudflare Pages Function; holds `env.OPENAI_API_KEY` server-side; accepts optional `body.clientKey` fallback from browser; model chain `gpt-4o → gpt-4o-mini`

---

## 1. Four-Page Flow

```
page-setup  →  page-chat  →  page-results  (researcher only)
                          ↘  page-done      (regular user)
```

| Page | ID | Purpose |
|------|----|---------|
| Setup | `page-setup` | Interview config (Goal, Audience, Questions) — pre-filled from `getCtx()` |
| Chat | `page-chat` | Live interview conversation |
| Results | `page-results` | Researcher dashboard — passcode protected |
| Done | `page-done` | Thank-you screen for regular users |

---

## 2. State Object `S`

```js
const S = {
  lang: 'en',            // 'en' or 'ar'
  theme: 'light',        // 'light' or 'dark'
  apiKey: '',
  numQ: 10,
  goal: '', audience: '', biz: 'Skoon',
  msgs: [],
  mainAsked: 0, followUps: 0, maxFollowUps: 0,
  waitingForAnswer: false, done: false,
  isResearcher: localStorage.getItem('researcher_access') === 'true',
  _iid: undefined,
};
```

---

## 3. Translations `TR` / `t()`

- All strings in `TR.en` and `TR.ar`
- `t('key')` reads `TR[S.lang][key]`
- Some values are **functions**: `TR[S.lang].progLbl(n, total)` → `"4 of 10"` / `"4 من 10"`
- **Always add to both languages simultaneously**

---

## 4. localStorage Keys

| Key | Stores |
|-----|--------|
| `skoon_api_key` | Client-side OpenAI API key override — only used when `env.OPENAI_API_KEY` is absent on the server |
| `skoon_theme` | `light` / `dark` |
| `skoon_lang` | `en` / `ar` |
| `researcher_access` | `'true'` when passcode entered |
| `researcher_pin` | Custom passcode (default: `1589`) |
| `researcher_name` | Researcher display name |
| `researcher_email` | Researcher email |
| `researcher_job` | Job title shown in sidebar |
| `researcher_pw` | Legacy password field (mirrors `researcher_pin`) |
| `skoon_session` | In-progress interview JSON — cleared on completion |
| `skoon_interviews` | Append-only array of all interviews — never deleted |
| `interview.businessName` | Business name for GPT prompts (overrides default `Skoon`) |
| `interview.goal` | Interview goal — read by `getCtx('goal')` |
| `interview.audience` | Target audience — read by `getCtx('audience')` |
| `interview.prompt` | Full custom analysis system prompt — **replaces** the default `_PROMPT_EN`/`_PROMPT_AR` entirely when set; cleared if value equals the default |

**Legacy keys still supported via `getCtx()` fallback:**
- `skoon_goal` → falls back to `interview.goal`
- `skoon_audience` → falls back to `interview.audience`
- `custom_analysis_prompt` → falls back to `interview.prompt`

---

## 5. Context Helper — `getCtx()` / `_CTX_DEFS`

```js
// Default values when no localStorage entry exists
const _CTX_DEFS = {
  businessName: 'Skoon',
  goal: '',
  audience: '',
  prompt: '',
};

// Read context with fallback chain:
// interview.<field>  →  legacy key  →  _CTX_DEFS default
function getCtx(field) { ... }
```

`getCtx()` is the single source of truth for all dynamic interview context:
- `startInterview()` calls `getCtx('goal')`, `getCtx('audience')`, `getCtx('businessName')`
- `_buildAnalysisSys(lang)` uses `getCtx('prompt')` as the **entire** system prompt when set (not appended)
- Setup prefill fields read from `getCtx()` on page load

---

## 6. Interview Persistence

```js
// Shape of each saved record
{
  id,                    // unique ID (S._iid)
  num,                   // sequential 1-based number
  date,                  // ISO date string
  lang,
  analysisLang,          // lang in which analysis was generated/last translated
  completed,             // true when fully saved
  goal, audience,
  lastQuestionSeen,      // S.mainAsked at save time
  totalQuestions,        // S.numQ
  progressPercent,       // 0-100
  keyNotes,              // analysis.summary at save time
  answers: [{ q, a }],
  analysis: null | {...} // GPT-4o results (researcher only)
}
```

- `saveInterview(analysis)` checks `S._iid` to prevent duplicates
- `analyzeStoredInterview(id, silent=false)` — re-runs GPT analysis on any stored interview and saves the result back; `silent=true` skips overlay and alerts (used by background queue)
- `getInterviewNumber(id)` — returns sequential 1-based number (oldest = #1)
- `_ivCache` — in-memory mirror of `skoon_interviews`; synced to localStorage on every write

---

## 7. Researcher Access

**Hidden from regular users — completely absent from DOM.**

**How to access:**
1. **Triple-click** the "Almosafer" brand name in the sidebar
2. Passcode modal appears → enter passcode (default: `1589`)
3. `renderResults({})` opens the researcher dashboard

**Changing the passcode:**
- Open the profile panel → Current Password + New Password → Save
- Stored in `localStorage.researcher_pin`
- `getResearcherPin()` always reads from localStorage, falling back to `'1589'`

---

## 8. Researcher Dashboard — 4 Tabs

| Tab | ID | Content |
|-----|----|---------|
| Overview | `db-pane-overview` | Greeting, stat cards (total/done/incomplete/rate), latest 5 interviews |
| Interviews | `db-pane-interviews` | All interviews as expandable cards with tabs (Notes, Summary, Insights, Quotes, UX مشاكل) |
| Analysis | `db-pane-analysis` | Full GPT analysis for selected interview (see §9) |
| Cross Analysis | `db-pane-insights` | Analyze multiple/all completed interviews together |

**Sidebar UI:**
- Brand area: Almosafer logo (`font-size:18px; font-weight:500`) + lang/theme `ic-btn` icons
- Profile row below brand → opens `sb-profile-panel` overlay
- Nav items: `.sb-nav-item` — hover/active use `--plight` background + `--primary` color
- Recent interviews: `.sb-rc-item` — name only + date only

**`dbTab(tab)` — tab switching:**
- Always sets `_dbTab = tab` (no toggle — clicking the active tab keeps it active)
- Shows/hides `db-bottom-btns` only on Overview tab

---

## 9. Analysis Pipeline

```
concludeInterview()
    └── finishMsg() → page-done   (always — no live analysis shown to users)

analyzeStoredInterview(id, silent)   (researcher triggers manually, or background queue)
    └── GPT-4o → saves result back to localStorage → renderAnalysis()

_autoAnalyzeAll()                 (called on dashboard open — background silent queue)
    └── iterates all unanalyzed interviews → analyzeStoredInterview(id, true)
```

**`renderResults(d)`** — smart routing:
- If `d` has real data (just finished) → shows Analysis tab with that data
- If `d` is empty (login / nav) → loads most recently analyzed interview; falls back to empty state

**`renderAnalysis(d, iv, targetId='res-content', rawIv=null)`:**
- `d` — analysis JSON
- `iv` — `{ lastQuestionSeen, totalQuestions }` for progress bar
- `targetId` — DOM element to inject into (supports cross-analysis output)
- `rawIv` — full stored interview object; used to show "Analyze Now" button when `d` is empty
- Empty state: shows search icon + "No analysis yet" + **"Analyze Now"** button → calls `analyzeStoredInterview(id)`

**Section headers** are clickable (`.ra-sec-hd`) → `openSecDetail(key)` → opens `#sec-ov` overlay with full section content. Sections stored in `window._raDetails`.

---

## 10. Analysis Sections

All 10 fields always requested from GPT-4o:

| Field | Shown to |
|-------|----------|
| `summary` | Everyone |
| `insights` | Everyone |
| `quotes` | Everyone |
| `patterns` | Everyone |
| `recommendations` | Everyone |
| `personas` | Researcher only |
| `empathy` | Researcher only |
| `journey` | Researcher only |
| `impactEffort` | Researcher only |
| `uxIssues` | Researcher only |

**Fixed enum values — always English even in Arabic mode:**
- `sentiment`: `positive` / `neutral` / `negative`
- `impact` / `effort`: `High` / `Medium` / `Low`
- `priority`: `Do First` / `Schedule` / `Delegate` / `Drop`
- `severity` / `frequency` / `criticality` / `costToFix`: `High` / `Medium` / `Low`

**Empathy Map labels:** plain text only — no emoji (Thinks / Feels / Says / Does)

---

## 11. UX Issues Table

Rendered inside `renderAnalysis()`. Structure: 5 columns — Issue, Frequency, Severity, Criticality, Cost to Fix.

**No legend cards at top.** No description text under issue title. No recommendation column.

**Formula block below the table** (compact, two cards side by side):
- Left card: scale definitions (Frequency 1–5, Severity 1–5, Criticality formula)
- Right card: `Criticality = (Severity + Frequency) ÷ 2` highlighted + strategy note

**Chip classes:**
```css
.ie-hi { background:#F5D7CD; color:#7a3a42; }  /* High */
.ie-md { background:#FAF4E6; color:#8a6820; }  /* Medium */
.ie-lo { background:#DDE8E4; color:#1a5a52; }  /* Low */
```
Dark mode chips follow deep palette-family backgrounds.

**Data field:** `iv.analysis.uxIssues` (array of objects). Each object uses `u.issue` for the title text (not `u.description`, not `u.title`).

---

## 12. Cross Analysis

**Tab: "التحليل المقارن" / "Cross Analysis"**

- Only **completed** interviews appear (`iv.completed === true`)
- **"Analyze All Completed"** button (`ca-all-btn`) → `runAllAnalysis()` → selects all completed, runs `_doCrossAnalysis(selected)`
- **"Analyze Selected"** button → `runCrossAnalysis()` → reads checked `.iv-chk` boxes
- Both route to `_doCrossAnalysis(selected)` which calls GPT then `renderCrossOutput(data)`
- `renderCrossOutput(data)` calls `renderAnalysis(data, null, 'db-ca-out')` — same visual output as single-interview analysis

---

## 13. CSS Variables & Design Tokens

```css
--primary: #1AA5B7        /* teal */
--phover:  #00465F
--plight:  rgba(26,165,183,0.10)   /* active/selected bg — brand-100 */
--phlight: rgba(26,165,183,0.05)   /* hover bg (lighter) */
--cta:     #1AA5B7        /* light mode CTA background */
--cta:     #003143        /* dark mode CTA background */
--cta-hover: #00465F
--stat-num: #1F2937       /* light mode — stat numbers */
--stat-num: #FFFFFF       /* dark mode  — stat numbers */
--bg, --surface, --border, --text, --muted, --accent

/* Dark mode layer depths */
--bg:      #00162A        /* dark — main content area */
--surface: #00121F        /* dark — cards/panels */
/* Sidebar always: #000B14 (darkest) via [data-theme="dark"] #res-panel */

--danger: #9D7982   /* light mode — dusty rose */
--danger: #c8aaaf   /* dark mode */
```

Dark mode overrides via `[data-theme="dark"]`.

### Beach Palette (chips, badges, row labels)

Used for all semantic chips and status indicators — **no yellow, no blue, no red anywhere**:

| Token | Hex | Use |
|-------|-----|-----|
| Mint | `#EAF3EE` | Completed badge, journey row labels, `.badge-completed` |
| Cream | `#FAF4E6` | Medium chip, neutral sentiment, `.ie-md`, `.js-neu` |
| Blush | `#F5D7CD` | Partial badge, high/danger chip, `.badge-partial`, `.ie-hi`, `.js-neg` |
| Lavender | `#C6C5CA` | (reserved / muted) |
| Sage | `#DDE8E4` | Low chip, `.ie-lo` |
| Pale mint | `#F9FAEA` | Early badge, `.badge-early` |

### Journey Map Phase Header Colors

Distinct color per phase — **not teal, not brand colors**:

| Col | Phase | Light bg / text | Dark bg / text |
|-----|-------|-----------------|----------------|
| 0 | Awareness | `#FEF9C3` / `#713F12` yellow | `#2D2500` / `#FDE68A` |
| 1 | Explore | `#D1FAE5` / `#064E3B` green | `#022C1E` / `#6EE7B7` |
| 2 | Compare | `#DBEAFE` / `#1E3A5F` blue | `#0C1E3A` / `#93C5FD` |
| 3 | Negotiate | `#FFE4E6` / `#881337` red | `#2D0A10` / `#FCA5A5` |
| 4 | Select | `#EDE9FE` / `#3B0764` purple | `#1A0B2E` / `#C4B5FD` |
| 5+ | loops to col 0 | | |

**Journey section header is clickable** — `secHd()` registers it in `_raDetails`. Clicking opens `#sec-ov` overlay with `.sec-panel.sec-wide` (`min(1280px,99vw)` / `96vh` / `4px` overlay padding) — wider than all other sections.

`openSecDetail(key)` toggles `.sec-wide` on `.sec-panel` only when `key === 'journey'`. `closeSecDetail()` always removes `.sec-wide`.

**Journey note cards** (`.jm-note`): light `background: var(--surface)`; dark `background: #002035`, `border-color: rgba(255,255,255,0.1)`.

**Journey cells** (`.jm-cell`): light `background: var(--bg)`; dark `background: #011624`.

**Row labels** (`.jm-row-label`) and base head cells (`.jm-head-cell`): `background: rgba(0,49,67,0.06)`. Dark: `rgba(0,49,67,0.28–0.30)`.

### Progress bars — uniform `3px` height everywhere
- Chat: `.prog-track { height: 3px }`
- Interview cards: `h-[3px]`
- Analysis tracker: `height:3px` inline

**Icon buttons** — `.ic-btn`: 28×28px circle, 14×14px SVG inside

```css
/* Light */
.ic-btn          { bg:#FFFFFF; color:#9CA3AF; border:rgba(0,49,67,0.2) }
.ic-btn:hover    { bg:#E6F0F2; color:#003143; border:rgba(0,49,67,0.3) }
.ic-btn:focus-visible { bg:#E6F0F2; color:#003143; border:rgba(0,49,67,0.3); ring:rgba(0,49,67,0.15) }
.ic-btn.ic-pressed    { bg:#00465F; color:#fff; border:#00465F }

/* Dark — transparent bg inherits panel color */
[data-theme="dark"] .ic-btn          { bg:transparent; color:rgba(255,255,255,0.55); border:rgba(255,255,255,0.15) }
[data-theme="dark"] .ic-btn:hover    { bg:rgba(255,255,255,0.08); color:rgba(255,255,255,0.9); border:rgba(255,255,255,0.28) }
[data-theme="dark"] .ic-btn:focus-visible { bg:rgba(26,165,183,0.18); color:#1AA5B7; border:#1AA5B7; ring:rgba(26,165,183,0.3) }
[data-theme="dark"] .ic-btn.ic-pressed    { bg:#1AA5B7; color:#fff; border:#1AA5B7 }
```

`pointerdown` listener adds `.ic-pressed` class for 200ms for visible click feedback.

**Interview cards** — `.iv-card-row`: hover/active use `--phlight` bg + `--primary` border

**Section headers** — `.ra-sec-hd`: flex row, title `.ra-sec-ttl` (font-weight 500) + chevron, cursor pointer

**Bullet/badge dots** — `.ra-badge`: 7×7px circle, `background: var(--primary)`, no text

**Journey steps** — `.journey-step`: `border: 1px solid var(--primary)`

**Impact/Effort table** — `.ie-table th`: `border-bottom: 1.5px solid var(--primary)` / `.ie-table td`: `border-bottom: 1px solid var(--primary)`

**Bottom action buttons** (`#s-new-btn`, `#edit-ctx-btn`, `#edit-ctx-btn-analysis`, `#s-home-btn`) and all `.btn-s`:
- `font-size: 12px`, `font-weight: 500`
- `.btn-s` base class owns these values — no ID-level override needed

---

## 14. Interview Card Status Badges

`ivStatusBadge(reached, total)` — returns colored badge using CSS classes (no inline color values):

| Condition | Badge | Class |
|-----------|-------|-------|
| `reached >= total` | مكتملة / Completed | `.badge-completed` (mint `#EAF3EE`) |
| `reached >= ceil(total/2)` | منتصف / Partial | `.badge-partial` (blush `#F5D7CD`) |
| `reached > 0` | بداية / Early | `.badge-early` (pale mint `#F9FAEA`) |
| `reached === 0` | لم تكتمل / Incomplete | `bg-[var(--bg)]` + border |

**Badge typography:** `font-family: IBM Plex Sans / IBM Plex Sans Arabic`, `font-size: 12px`, `font-weight: 400`, `color: var(--text)` — **no colored text, charcoal in light / gray in dark only**.

All badges: `min-width: 52px`, uniform size.

---

## 15. Interview Card Tabs — Language Enforcement

Cards in the Interviews tab have 5 content panes: **Notes** (always first), Summary, Insights, Quotes, UX مشاكل.

Each pane has two IDs:
- Outer: `ivp-{id}-{tab}` — the tab pane container
- Inner: `ivp-{id}-{tab}-body` — the content div (updated by `_updateCardContent`)

**Cards always open on the Notes tab.** There are no auto-switches to Summary after analysis runs.

**`toggleIvCard(ivId)`** is **async**. On expand:
1. Opens on Notes tab (always)
2. If analysis is missing, silently calls `analyzeStoredInterview(ivId, true)` in background — stays on Notes tab while it runs
3. If `iv.analysisLang !== S.lang`, shows "Translating…" placeholder in all body divs, calls `_enforceAnalysisLang(iv.analysis, S.lang, true)`, saves translated analysis back to `_ivCache` + localStorage, then calls `_updateCardContent(ivId, analysis)` to replace placeholders

**`_updateCardContent(ivId, analysis)`** — updates all 5 body divs from an analysis object without re-rendering the entire card.

---

## 16. RTL / Bilingual Layout

- `[dir="rtl"]` on `<html>` — set by `cycleLang()`
- **Always CSS logical properties**: `margin-inline-start`, `padding-inline-end`, `border-inline-start`
- **Never**: `margin-left`, `padding-right`
- `[dir="rtl"] .rtl-flip { transform: scaleX(-1); }` — for chevron/arrow icons
- Arabic font: `IBM Plex Sans Arabic`, English: `IBM Plex Sans`
- Font switching via CSS variable: `:root { --font: 'IBM Plex Sans', ... }` / `[dir="rtl"] { --font: 'IBM Plex Sans Arabic', ... }` — all elements use `var(--font)` or `inherit`, no hardcoded font-family strings anywhere
- Arabic text: `line-height: 1.9` for readability

---

## 17. Chat Input Area

**Layout:**
```html
<div class="chat-scroll">          <!-- flex:1, overflow-y:auto, plain block container -->
  <div class="msgs" id="msgs">     <!-- display:flex, flex-direction:column, gap:13px -->
  <div id="end-row">               <!-- End Interview button — inside chat-scroll -->
  <div id="chat-btm">              <!-- 1px anchor for scroll -->
</div>
<div class="input-bar">
  <div class="inp-inner">          <!-- max-width:560px, centered -->
    <div class="ta-wrap">          <!-- position:relative -->
      <textarea class="chat-ta">
      <button class="mic-btn">     <!-- inset-inline-end:38px, 20×20px -->
      <button class="send-btn">    <!-- inset-inline-end:10px, 20×20px -->
```

**Typography:** all chat elements use `font-size:14px`, `font-weight:400`, `font-family: var(--font)`

**Bubble colors:**
- AI `.msg.ai .bbl`: `background: var(--surface)`, `border: 1px solid var(--border)`
- User `.msg.usr .bbl`: `background: rgba(11,94,87,0.13)`, `color: #e8624a` (coral)
- Dark mode user bubble: `background: rgba(15,118,110,0.22)`, `color: var(--text)`

**Auto-scroll:** `scrollBtm()` sets `c.scrollTop = c.scrollHeight` + `setTimeout(80)`. MutationObserver on `#msgs` also calls `scrollBtm()` on child changes.

**Microphone:** `toggleMic()` uses Web Speech API with `continuous:true`, `interimResults:true`. Language: `ar-SA` in Arabic, `en-US` in English. Button gets `.mic-active` class while recording. Buttons positioned with `inset-inline-end` (RTL-safe).

---

## 18. Profile Panel (`sb-profile-panel`)

Absolute overlay inside `#res-panel` sidebar nav.

**Stats shown:** Language, API status (dot + Connected/Not connected), Mode, Total interviews, Completed, Completion rate, Last activity

**Editable fields:** Name, Job Title, Email, Current Password, New Password

**`openProfilePanel()`** — populates all fields from localStorage, computes stats from `getAllInterviews()`

**`saveProfile()`** — validates current password against `getResearcherPin()`, saves new pin to `researcher_pin`, refreshes sidebar identity row

**`getDisplayName()`** — reads `researcher_name` from localStorage, falls back to "Researcher"

---

## 19. Language Enforcement in System Prompts

All GPT-4o system prompts enforce strict language consistency. **Never weaken these rules.**

### Interview conductor — `buildSys()`
- **Arabic:** Opens with an explicit block: *"استجب بالعربية الخليجية فقط في كل رسالة بدون استثناء. ممنوع أي كلمة إنجليزية عدا اسم 'Skoon'. إذا رد المستخدم بالإنجليزية، واصل بالعربية الخليجية."*
- **English:** Opens with: *"Respond in English ONLY in every single message. Never switch to Arabic or any other language, even if the participant writes in Arabic."*

### Analysis prompts — `_buildAnalysisSys(lang)`

All analysis calls (`analyze()`, `analyzeStoredInterview()`, `_doCrossAnalysis()`) use `_buildAnalysisSys(lang)`:

**Default prompts** are stored in module-level template literal constants:
- `_PROMPT_AR` — full Arabic Gulf analysis system prompt
- `_PROMPT_EN` — full English analysis system prompt (contains escaped backticks for JSON field names)

**Behavior:**
- If `getCtx('prompt')` is set (non-empty), it is used as the **entire** system prompt — no wrapping, no appending. This is the researcher's full custom prompt.
- Otherwise: falls back to `_PROMPT_AR` (when `lang === 'ar'`) or `_PROMPT_EN`

**Never weaken the language enforcement headers** inside `_PROMPT_AR` / `_PROMPT_EN`.

- **Arabic default opens with:** *"استجب باللغة العربية الخليجية فقط في كل كلمة. ممنوع استخدام أي كلمة إنجليزية في القيم النصية — هذا شرط مطلق."*
- **English default opens with:** *"Respond ONLY in English. Do not use any Arabic words in text values — this is absolute and non-negotiable."*

### Post-generation translation — `_enforceAnalysisLang(data, targetLang, quiet)`
- Called when a stored interview's `analysisLang` does not match `S.lang`
- Silently re-translates the analysis JSON via GPT
- `quiet = true` suppresses UI spinners (used by `toggleIvCard`)

**Allowed English exceptions in Arabic mode:** `"Skoon"`, `sentiment`, `impact`, `effort`, `priority` enum values, `severity`, `frequency`, `criticality`, `costToFix` values only.

**Tone:** Arabic = natural Gulf Arabic UX research. English = professional, concise, evidence-based.

---

## 20. API / Cloudflare Worker Architecture

All OpenAI calls go through the Cloudflare Pages Function at `/api/chat` — the key is **never** in the browser.

**Key priority (in `functions/api/chat.js`):**
1. `env.OPENAI_API_KEY` — set in the Cloudflare dashboard, server-side only
2. `body.clientKey` — sent from browser when the researcher has stored a key in `skoon_api_key` localStorage

The browser sends `clientKey` only when `skoon_api_key` is set in localStorage. The server uses the env key first and only falls back to `clientKey` when the env key is absent.

**Model fallback chain:** `gpt-4o` → `gpt-4o-mini` (on 404 / 403 / `model_not_found` / timeout / network error).

**`checkApiStatus()`** — probes `/api/chat` by sending `messages: []`:
- Response `code === 'bad_request'` → connected (server reached OpenAI but rejected the empty array)
- Response `code === 'config_missing'` → no key configured anywhere
- Network error → unknown

**Git push workaround** (if `140.82.121.4` is blocked):
```
git -c http.curloptResolve="github.com:443:20.201.28.151" push origin main
```

---

## 21. Edit Context Modal

Researcher-only modal opened via the "Edit Context" button in the dashboard sidebar.

**Fields:**

| Field | ID | Stored in |
|-------|----|-----------|
| Business Name | `cxe-biz` | `interview.businessName` |
| Goal | `cxe-goal` | `interview.goal` |
| Audience | `cxe-audience` | `interview.audience` |
| Analysis Prompt | `cxe-prompt` | `interview.prompt` (cleared if equal to default) |
| API Key | `cxe-api-key` | `skoon_api_key` |

**Analysis Prompt rules:**
- Always displayed in English, always `dir="ltr"` — forced in JS even in Arabic mode
- Pre-filled with `getCtx('prompt') || _PROMPT_EN`
- Saved only if the value differs from `_PROMPT_EN`; otherwise the localStorage key is removed (reverts to built-in default)
- Label in English: `"Analysis Prompt"` / Arabic: `"موجّه التحليل"`

**API section (`#cxe-key-section`):**
- Section label: `"API إعدادات"` (both languages)
- Field label: `"OpenAI API مفتاح"` (both languages)
- Input: `type="password"`, eye toggle button (`toggleCxeKeyVis()`)
- Buttons: `"حفظ المفتاح"` (`saveCxeKey()`) and `"حذف المفتاح"` (`deleteCxeKey()`) — with ✓ feedback on click
- Helper text: `"يحفظ محليًا في متصفحك ولا يُرسل إلا إلى OpenAI."`
- Connection status dot + label rendered below buttons by `_renderApiStatus()`

**Scroll behaviour:**
- Overlay selector `#context-editor-ov.show` has `align-items: flex-start; overflow-y: auto; padding: 28px 0` so tall content doesn't clip at viewport edges. Other overlays are unaffected.

---

## 22. Key Functions Reference

| Function | Purpose |
|----------|---------|
| `goTo(pageId)` | Navigate between pages |
| `cycleLang()` | Toggle en/ar, update dir, re-render |
| `toggleTheme()` | Toggle light/dark |
| `startInterview()` | Build system prompt, begin chat |
| `concludeInterview()` | End session → always routes to page-done |
| `analyze()` | GPT-4o analysis of current session |
| `analyzeStoredInterview(id, silent)` | GPT-4o analysis of any stored interview; `silent=true` skips overlays |
| `_autoAnalyzeAll()` | Background queue — silently analyzes all unanalyzed stored interviews on dashboard open |
| `renderResults(d)` | Navigate to results page, smart-route analysis |
| `renderAnalysis(d, iv, targetId, rawIv)` | Render analysis content |
| `renderOverview()` | Render dashboard Overview tab |
| `renderInterviewsTab()` | Render all interview cards |
| `renderCrossTab()` | Render cross-analysis tab (completed only) |
| `runAllAnalysis()` | Analyze all completed interviews together |
| `_doCrossAnalysis(selected)` | Core cross-analysis GPT call + render |
| `loadInterviewById(id)` | Load stored interview into Analysis tab |
| `openSecDetail(key)` | Open section detail overlay |
| `openProfilePanel()` | Open profile overlay panel |
| `saveProfile()` | Save profile + passcode changes |
| `getResearcherPin()` | Read pin from localStorage (default `1589`) |
| `ivStatusBadge(reached, total)` | Status badge HTML (palette CSS classes) |
| `ivRowHtml(iv, fmt, expandable)` | Interview card HTML |
| `toggleIvCard(ivId)` | **async** — expand/collapse card, lazy-translate on open |
| `_updateCardContent(ivId, analysis)` | Update card body divs after translation |
| `getAllInterviews()` | Read + number all interviews from localStorage |
| `getInterviewNumber(id)` | Sequential 1-based number for an interview |
| `getCtx(field)` | Read context with fallback chain (see §5) |
| `_buildAnalysisSys(lang)` | Build analysis system prompt — returns custom prompt if set, else `_PROMPT_AR`/`_PROMPT_EN` |
| `_enforceAnalysisLang(data, lang, quiet)` | Post-generate translation of analysis JSON |
| `openContextEditor()` | Open Edit Context modal (researcher only) — pre-fills all fields from `getCtx()` + localStorage |
| `saveContext()` | Save Goal, Audience, Business Name, Analysis Prompt, API key from Edit Context modal |
| `resetContext()` | Clear all `interview.*` + `skoon_api_key` keys; restore `_PROMPT_EN` in prompt field |
| `saveCxeKey()` | Save API key from Edit Context key field to `skoon_api_key`; shows ✓ feedback; calls `checkApiStatus()` |
| `deleteCxeKey()` | Remove `skoon_api_key`; clears input; calls `checkApiStatus()` |
| `toggleCxeKeyVis()` | Toggle password/text visibility on the API key input in Edit Context |
| `checkApiStatus()` | Probe `/api/chat` with empty messages; `bad_request` = connected, `config_missing` = not connected |
| `_renderApiStatus(status)` | Update dot + label in Edit Context and Profile Panel based on connection result |
| `scrollBtm()` | Scroll chat to bottom |
| `toggleMic()` | Start/stop speech-to-text |
| `buildSys()` | Build interview system prompt (AR/EN) |
| `dbTab(tab)` | Switch researcher dashboard tab |

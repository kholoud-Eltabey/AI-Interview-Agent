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

**Skoon Interview Agent** — an AI-powered user interview tool for Skoon, a Saudi rental property platform.

| | |
|---|---|
| **Single file** | `index.html` — all HTML, CSS, and JS inline in one file |
| **No tooling** | No build step, no framework, no package.json, no dependencies |
| **AI model** | OpenAI GPT-4o — called directly from the browser |
| **Languages** | Gulf Arabic / English — switchable at any time |
| **Run** | Open `index.html` directly in a browser, or `npx serve .` |

**Other files:**
- `_headers` — Cloudflare Pages cache-control headers (no-cache for `/` and `/index.html`)

---

## 1. Four-Page Flow

```
page-setup  →  page-chat  →  page-results  (researcher only)
                          ↘  page-done      (regular user)
```

| Page | ID | Purpose |
|------|----|---------|
| Setup | `page-setup` | API key entry + interview config |
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
| `skoon_api_key` | OpenAI API key |
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
| `interview.prompt` | Custom analysis instructions appended to `_buildAnalysisSys()` |

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
- `_buildAnalysisSys(lang)` appends `getCtx('prompt')` when set
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
- `analyzeStoredInterview(id)` — re-runs GPT analysis on any stored interview and saves the result back
- `getInterviewNumber(id)` — returns sequential 1-based number (oldest = #1)
- `_ivCache` — in-memory mirror of `skoon_interviews`; synced to localStorage on every write

---

## 7. Researcher Access

**Hidden from regular users — completely absent from DOM.**

**How to access:**
1. **Triple-click** the "Skoon" brand name in the sidebar
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
| Interviews | `db-pane-interviews` | All interviews as expandable cards with tabs (Notes, Summary, Insights, Quotes, UX Issues) |
| Analysis | `db-pane-analysis` | Full GPT analysis for selected interview (see §9) |
| Cross Analysis | `db-pane-insights` | Analyze multiple/all completed interviews together |

**Sidebar UI:**
- Brand area: Skoon logo + lang/theme `ic-btn` icons (32×32px, 16×16px SVG)
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

analyzeStoredInterview(id)        (researcher triggers manually from dashboard)
    └── GPT-4o → saves result back to localStorage → renderAnalysis()
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
--primary: #0B5E57        /* teal */
--phover:  #094D47
--plight:  rgba(11,94,87,0.08)   /* active/selected bg */
--phlight: rgba(11,94,87,0.04)   /* hover bg (lighter) */
--bg, --surface, --border, --text, --muted, --accent

--danger: #9D7982   /* light mode — dusty rose (replaces red) */
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

### Botanical Palette (Journey Map phase headers only)

5-colour palette for `.jm-head-cell` phase title cells:

| Col | Light bg | Dark bg |
|-----|----------|---------|
| 0 | `#E3DBD3` / text `#3a2e28` | `#322e2a` / text `#ede8e2` |
| 1 | `#9CB2A5` / text `#1a3228` | `#1e2e26` / text `#c8ddd6` |
| 2 | `#8BA4B3` / text `#162535` | `#1a2530` / text `#b8d0de` |
| 3 | `#C8B7C9` / text `#3a1f42` | `#2a2030` / text `#dccee0` |
| 4 | `#9D7982` / text `#fff`    | `#2e2028` / text `#e0c8cc` |
| 5+ | repeats col 0 pattern | |

**Journey note cards** (`.jm-note`): always `background: var(--surface)`, `border: 1px solid var(--border)` — no column colour.

**Row labels** (`.jm-row-label`) and base head cells (`.jm-head-cell`): `background: #EAF3EE` (light mint). Dark: `rgba(26, 48, 40, 0.55)`.

### Progress bars — uniform `3px` height everywhere
- Chat: `.prog-track { height: 3px }`
- Interview cards: `h-[3px]`
- Analysis tracker: `height:3px` inline

**Icon buttons** — `.ic-btn`: 32×32px circle, 16×16px SVG inside

**Interview cards** — `.iv-card-row`: hover/active use `--phlight` bg + `--primary` border

**Section headers** — `.ra-sec-hd`: flex row, title `.ra-sec-ttl` (font-weight 500) + chevron, cursor pointer

**Bullet/badge dots** — `.ra-badge`: 7×7px circle, `background: var(--primary)`, no text

**Journey steps** — `.journey-step`: `border: 1px solid var(--primary)`

**Impact/Effort table** — `.ie-table th`: `border-bottom: 1.5px solid var(--primary)` / `.ie-table td`: `border-bottom: 1px solid var(--primary)`

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

Cards in the Interviews tab have 4 content panes: Summary, Insights, Quotes, UX Issues.

Each pane has two IDs:
- Outer: `ivp-{id}-{tab}` — the tab pane container
- Inner: `ivp-{id}-{tab}-body` — the content div (updated by `_updateCardContent`)

**`toggleIvCard(ivId)`** is **async**. On expand, if `iv.analysisLang !== S.lang`:
1. Shows "Translating…" placeholder in all 4 body divs
2. Calls `_enforceAnalysisLang(iv.analysis, S.lang, true)` silently
3. Saves translated analysis back to `_ivCache` + localStorage with `analysisLang` set
4. Calls `_updateCardContent(ivId, analysis)` to replace placeholders

**`_updateCardContent(ivId, analysis)`** — updates all 4 body divs from an analysis object without re-rendering the entire card.

---

## 16. RTL / Bilingual Layout

- `[dir="rtl"]` on `<html>` — set by `cycleLang()`
- **Always CSS logical properties**: `margin-inline-start`, `padding-inline-end`, `border-inline-start`
- **Never**: `margin-left`, `padding-right`
- `[dir="rtl"] .rtl-flip { transform: scaleX(-1); }` — for chevron/arrow icons
- Arabic font: `IBM Plex Sans Arabic`, English: `IBM Plex Sans`
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

**Typography:** all chat elements use `font-size:14px`, `font-weight:400`, `font-family: 'IBM Plex Sans', 'IBM Plex Sans Arabic', sans-serif`

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

- **Arabic:** Opens with: *"استجب باللغة العربية الخليجية فقط في كل كلمة. ممنوع استخدام أي كلمة إنجليزية في القيم النصية — هذا شرط مطلق."*
- **English:** Opens with: *"Respond ONLY in English. Do not use any Arabic words in text values — this is absolute and non-negotiable."*
- If `getCtx('prompt')` is set, it is **appended** at the end as additional researcher instructions.

### Post-generation translation — `_enforceAnalysisLang(data, targetLang, quiet)`
- Called when a stored interview's `analysisLang` does not match `S.lang`
- Silently re-translates the analysis JSON via GPT
- `quiet = true` suppresses UI spinners (used by `toggleIvCard`)

**Allowed English exceptions in Arabic mode:** `"Skoon"`, `sentiment`, `impact`, `effort`, `priority` enum values, `severity`, `frequency`, `criticality`, `costToFix` values only.

**Tone:** Arabic = natural Gulf Arabic UX research. English = professional, concise, evidence-based.

---

## 20. Key Functions Reference

| Function | Purpose |
|----------|---------|
| `goTo(pageId)` | Navigate between pages |
| `cycleLang()` | Toggle en/ar, update dir, re-render |
| `toggleTheme()` | Toggle light/dark |
| `startInterview()` | Build system prompt, begin chat |
| `concludeInterview()` | End session → always routes to page-done |
| `analyze()` | GPT-4o analysis of current session |
| `analyzeStoredInterview(id)` | GPT-4o analysis of any stored interview |
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
| `_buildAnalysisSys(lang)` | Build analysis system prompt with language header + custom instructions |
| `_enforceAnalysisLang(data, lang, quiet)` | Post-generate translation of analysis JSON |
| `scrollBtm()` | Scroll chat to bottom |
| `toggleMic()` | Start/stop speech-to-text |
| `buildSys()` | Build interview system prompt (AR/EN) |
| `dbTab(tab)` | Switch researcher dashboard tab |

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

---

## 5. Interview Persistence

```js
// Shape of each saved record
{
  id,                    // unique ID (S._iid)
  date,                  // ISO date string
  lang,
  completed,             // true when fully saved
  goal, audience,
  lastQuestionSeen,      // S.mainAsked at save time
  totalQuestions,        // S.numQ
  answers: [{ q, a }],
  analysis: null | {...} // GPT-4o results (researcher only)
}
```

- `saveInterview(analysis)` checks `S._iid` to prevent duplicates
- `analyzeStoredInterview(id)` — re-runs GPT analysis on any stored interview and saves the result back

---

## 6. Researcher Access

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

## 7. Researcher Dashboard — 4 Tabs

| Tab | ID | Content |
|-----|----|---------|
| Overview | `db-pane-overview` | Greeting, stat cards (total/done/incomplete/rate), latest 5 interviews |
| Interviews | `db-pane-interviews` | All interviews as expandable cards with tabs (Notes, Summary, Insights, Quotes, UX Issues) |
| Analysis | `db-pane-analysis` | Full GPT analysis for selected interview (see §8) |
| Cross Analysis | `db-pane-insights` | Analyze multiple/all completed interviews together |

**Sidebar UI:**
- Brand area: Skoon logo + lang/theme `ic-btn` icons (32×32px, 16×16px SVG)
- Profile row below brand → opens `sb-profile-panel` overlay
- Nav items: `.sb-nav-item` — hover/active use `--plight` background + `--primary` color
- Recent interviews: `.sb-rc-item` — name only + date only

---

## 8. Analysis Pipeline

```
concludeInterview()
    ├── isResearcher → analyze() → GPT-4o → renderResults(data)
    └── !isResearcher → finishMsg() → page-done
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

## 9. Analysis Sections

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
| `userFlow` | Researcher only |

**Fixed enum values — always English even in Arabic mode:**
- `sentiment`: `positive` / `neutral` / `negative`
- `impact` / `effort`: `High` / `Medium` / `Low`
- `priority`: `Do First` / `Schedule` / `Delegate` / `Drop`

**Empathy Map labels:** plain text only — no emoji (Thinks / Feels / Says / Does)

---

## 10. Cross Analysis

**Tab: "التحليل المقارن" / "Cross Analysis"**

- Only **completed** interviews appear (`iv.completed === true`)
- **"Analyze All Completed"** button (`ca-all-btn`) → `runAllAnalysis()` → selects all completed, runs `_doCrossAnalysis(selected)`
- **"Analyze Selected"** button → `runCrossAnalysis()` → reads checked `.iv-chk` boxes
- Both route to `_doCrossAnalysis(selected)` which calls GPT then `renderCrossOutput(data)`
- `renderCrossOutput(data)` calls `renderAnalysis(data, null, 'db-ca-out')` — same visual output as single-interview analysis

---

## 11. CSS Variables & Design Tokens

```css
--primary: #0B5E57        /* teal */
--phover:  #094D47
--plight:  rgba(11,94,87,0.08)   /* active/selected bg */
--phlight: rgba(11,94,87,0.04)   /* hover bg (lighter) */
--bg, --surface, --border, --text, --muted, --danger, --accent
```

Dark mode overrides via `[data-theme="dark"]`.

**Progress bars** — uniform `3px` height everywhere:
- Chat: `.prog-track { height: 3px }`
- Interview cards: `h-[3px]`
- Analysis tracker: `height:3px` inline

**Icon buttons** — `.ic-btn`: 32×32px circle, 16×16px SVG inside

**Interview cards** — `.iv-card-row`: hover/active use `--phlight` bg + `--primary` border

**Section headers** — `.ra-sec-hd`: flex row, title `.ra-sec-ttl` (font-weight 500) + chevron, cursor pointer

---

## 12. RTL / Bilingual Layout

- `[dir="rtl"]` on `<html>` — set by `cycleLang()`
- **Always CSS logical properties**: `margin-inline-start`, `padding-inline-end`, `border-inline-start`
- **Never**: `margin-left`, `padding-right`
- `[dir="rtl"] .rtl-flip { transform: scaleX(-1); }` — for chevron/arrow icons
- Arabic font: `IBM Plex Sans Arabic`, English: `IBM Plex Sans`
- Arabic text: `line-height: 1.9` for readability

---

## 13. Profile Panel (`sb-profile-panel`)

Absolute overlay inside `#res-panel` sidebar nav.

**Stats shown:** Language, API status (dot + Connected/Not connected), Mode, Total interviews, Completed, Completion rate, Last activity

**Editable fields:** Name, Job Title, Email, Current Password, New Password

**`openProfilePanel()`** — populates all fields from localStorage, computes stats from `getAllInterviews()`

**`saveProfile()`** — validates current password against `getResearcherPin()`, saves new pin to `researcher_pin`, refreshes sidebar identity row

**`getDisplayName()`** — reads `researcher_name` from localStorage, falls back to "Researcher"

---

## 14. Interview Card Status Badges

`ivStatusBadge(reached, total)` — returns colored badge:

| Condition | Badge | Color |
|-----------|-------|-------|
| `reached >= total` | مكتملة / Completed | Green |
| `reached >= ceil(total/2)` | منتصف / Partial | Amber |
| `reached > 0` | بداية / Early | Blue |
| `reached === 0` | لم تكتمل / Incomplete | Gray |

All badges: `min-width: 52px`, uniform size.

---

## 15. Key Functions Reference

| Function | Purpose |
|----------|---------|
| `goTo(pageId)` | Navigate between pages |
| `cycleLang()` | Toggle en/ar, update dir, re-render |
| `toggleTheme()` | Toggle light/dark |
| `startInterview()` | Build system prompt, begin chat |
| `concludeInterview()` | End session, route to analyze or done |
| `analyze()` | GPT-4o analysis of current session |
| `analyzeStoredInterview(id)` | GPT-4o analysis of any stored interview |
| `renderResults(d)` | Navigate to results page, smart-route analysis |
| `renderAnalysis(d, iv, targetId, rawIv)` | Render analysis content |
| `renderOverview()` | Render dashboard Overview tab |
| `renderInterviewsTab()` | Render all interview cards |
| `renderCrossTab()` | Render cross-analysis tab (completed only) |
| `runAllAnalysis()` | Analyze all completed interviews together |
| `loadInterviewById(id)` | Load stored interview into Analysis tab |
| `openSecDetail(key)` | Open section detail overlay |
| `openProfilePanel()` | Open profile overlay panel |
| `saveProfile()` | Save profile + passcode changes |
| `getResearcherPin()` | Read pin from localStorage (default `1589`) |
| `ivStatusBadge(reached, total)` | Status badge HTML |
| `ivRowHtml(iv, fmt, expandable)` | Interview card HTML |
| `getAllInterviews()` | Read + number all interviews from localStorage |

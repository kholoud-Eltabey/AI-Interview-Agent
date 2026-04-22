---
name: frontend-design
description: >
  Use this skill for any frontend UI/UX design and implementation task involving HTML, CSS, and JavaScript.
  Trigger when the user wants to: build or edit visual components (cards, chips, badges, tables, modals,
  sidebars, nav items, overlays), apply or extend a design system (CSS variables, colour palettes, typography),
  implement dark/light theme toggling, handle RTL/bilingual (Arabic/English) layouts, work on single-file
  HTML/CSS/JS apps, or run a visual QA pass. Also trigger when the user shows a screenshot and asks to match,
  improve, or fix the visual output, when they reference specific design tokens (--primary, --surface, palette
  colours, font sizes), or when they say words like "redesign", "clean up", "match the style", "make it look
  like X", "fix the colours", or "RTL". Use this skill even if the request sounds like a small tweak — tiny
  visual changes carry the same design-system risks as large ones.
---

# Frontend Design Skill

## 1. Core Principles

- **Single source of truth**: all colours, spacing, and type live in CSS custom properties — never hardcode hex values or pixel sizes outside `:root`
- **RTL-safe by default**: always use logical CSS properties (`padding-inline-start`, `margin-inline-end`, `border-inline-start`). Never use `left`/`right` directional properties
- **No yellow, no blue, no red**: the design language uses a warm beach palette — replace any yellow/blue/red with the tokens below
- **Theme-aware everywhere**: every new element must work in both `[data-theme="light"]` and `[data-theme="dark"]`
- **Palette discipline**: don't invent new colours — map everything to the palette defined in §3

---

## 2. CSS Custom Properties (Root Tokens)

```css
:root {
  /* Brand */
  --primary:  #0B5E57;          /* teal — buttons, links, active states */
  --phover:   #094D47;          /* primary hover */
  --plight:   rgba(11,94,87,0.08);  /* active/selected background */
  --phlight:  rgba(11,94,87,0.04);  /* hover background (lighter) */

  /* Surfaces */
  --bg:       #F7F7F5;
  --surface:  #FFFFFF;
  --border:   #E5E5E3;
  --text:     #1A1A18;
  --muted:    #6B6B69;
  --accent:   #F0EDEA;

  /* Semantic */
  --danger:   #9D7982;          /* dusty rose — NOT red */
}

[data-theme="dark"] {
  --bg:       #141413;
  --surface:  #1E1E1C;
  --border:   #2E2E2C;
  --text:     #E8E8E6;
  --muted:    #8A8A88;
  --accent:   #252523;
  --danger:   #c8aaaf;
}
```

---

## 3. Colour Palettes

### Beach Palette — chips, badges, status indicators

| Name | Hex | Usage |
|------|-----|-------|
| Mint | `#EAF3EE` | Completed badge, row labels, positive states |
| Cream | `#FAF4E6` | Medium severity, neutral sentiment |
| Blush | `#F5D7CD` | High severity, partial badge, negative/danger |
| Sage | `#DDE8E4` | Low severity, success/low states |
| Pale mint | `#F9FAEA` | Early/pending badge |
| Lavender | `#C6C5CA` | Reserved / muted accent |

**CSS classes for chips:**
```css
.chip-hi  { background:#F5D7CD; color:#7a3a42; }
.chip-md  { background:#FAF4E6; color:#8a6820; }
.chip-lo  { background:#DDE8E4; color:#1a5a52; }

[data-theme="dark"] .chip-hi { background:#3d1e22; color:#f0c0c4; }
[data-theme="dark"] .chip-md { background:#2e2a1a; color:#e4d4a0; }
[data-theme="dark"] .chip-lo { background:#1a2e2a; color:#9ad0c4; }
```

**Status badge CSS classes** (never use inline colors):
```css
.badge-completed { background:#EAF3EE; }
.badge-partial   { background:#F5D7CD; }
.badge-early     { background:#F9FAEA; }
/* badge-incomplete: bg-[var(--bg)] + border */

/* All badges share this typography */
.badge-completed, .badge-partial, .badge-early {
  font-family: 'IBM Plex Sans', 'IBM Plex Sans Arabic', sans-serif;
  font-size: 12px;
  font-weight: 400;
  color: var(--text);    /* charcoal light / gray dark — never coloured text */
  min-width: 52px;
  padding-inline-start: 6px;
  padding-inline-end: 6px;
  border-radius: 6px;
}
[data-theme="dark"] .badge-completed { background:#1a3028; }
[data-theme="dark"] .badge-partial   { background:#3d1e22; }
[data-theme="dark"] .badge-early     { background:#2a2a32; }
```

### Botanical Palette — Journey Map / phase headers ONLY

Use these as column-indexed backgrounds on phase title cells. Note content stays plain `var(--surface)`.

```css
.jm-col-0.jm-head-cell { background:#E3DBD3; color:#3a2e28; }
.jm-col-1.jm-head-cell { background:#9CB2A5; color:#1a3228; }
.jm-col-2.jm-head-cell { background:#8BA4B3; color:#162535; }
.jm-col-3.jm-head-cell { background:#C8B7C9; color:#3a1f42; }
.jm-col-4.jm-head-cell { background:#9D7982; color:#ffffff; }
/* col 5+ repeats col 0 */

[data-theme="dark"] .jm-col-0.jm-head-cell { background:#322e2a; color:#ede8e2; }
[data-theme="dark"] .jm-col-1.jm-head-cell { background:#1e2e26; color:#c8ddd6; }
[data-theme="dark"] .jm-col-2.jm-head-cell { background:#1a2530; color:#b8d0de; }
[data-theme="dark"] .jm-col-3.jm-head-cell { background:#2a2030; color:#dccee0; }
[data-theme="dark"] .jm-col-4.jm-head-cell { background:#2e2028; color:#e0c8cc; }

/* Row labels and base head cells — light mint */
.jm-head-cell, .jm-row-label { background:#EAF3EE; }
[data-theme="dark"] .jm-head-cell,
[data-theme="dark"] .jm-row-label { background:rgba(26,48,40,0.55); }

/* Note cards — always plain surface, no column colour */
.jm-note {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 6px 8px;
  font-size: 11px;
  font-weight: 400;
  line-height: 1.45;
  color: var(--text);
}
```

---

## 4. Typography

```css
body {
  font-family: 'IBM Plex Sans', 'IBM Plex Sans Arabic', sans-serif;
}

/* Arabic body text needs more line-height to breathe */
[dir="rtl"] p, [dir="rtl"] li, [dir="rtl"] .body-text {
  line-height: 1.9;
}

/* Font size scale — nothing outside these three */
/* 16px — section headings / card titles */
/* 14px — body text, labels, inputs */
/* 12px — badges, chips, captions, small metadata */

/* Font weights */
/* 500 — titles, section headers */
/* 400 — everything else */
```

---

## 5. RTL / Bilingual Layout Rules

The app supports both `dir="ltr"` (English) and `dir="rtl"` (Arabic) on `<html>`.

**Always use logical properties:**
```css
/* ✅ Correct */
padding-inline-start: 16px;
padding-inline-end: 16px;
margin-inline-start: 8px;
border-inline-start: 2px solid var(--primary);
inset-inline-end: 10px;

/* ❌ Never use */
padding-left / padding-right
margin-left / margin-right
border-left / border-right
right / left (in positioned elements)
```

**Flip icons for RTL:**
```css
[dir="rtl"] .rtl-flip { transform: scaleX(-1); }
```
Apply `.rtl-flip` to chevrons, arrows, and directional icons.

**Flex row direction** — flexbox respects `dir` automatically for most cases, but if you need explicit reversal:
```css
[dir="rtl"] .some-row { flex-direction: row-reverse; }
```

---

## 6. Dark / Light Theme

Toggle by setting `data-theme="dark"` on `<html>`. All overrides live under `[data-theme="dark"]`.

**Pattern:**
```js
function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('skoon_theme', next);
}
```

**Rules:**
- Every new background, border, text colour must use `var(--token)` — never hardcoded
- Chip/badge dark overrides follow deep palette-family backgrounds (see §3)
- Images/SVG icons that need inversion: `[data-theme="dark"] .invert-dark { filter: invert(1); }`

---

## 7. Component Patterns

### Cards
```css
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
}
.card:hover { background: var(--phlight); }
.card.active { background: var(--plight); border-color: var(--primary); }
```

### Chips / Badges
- Use beach palette classes from §3 — never inline background/color
- Text: always `color: var(--text)` for badges, coloured text only for chips (see chip class definitions)
- Size: `font-size: 12px`, `font-weight: 400`, `border-radius: 6px`

### Tables
```css
.data-table th {
  border-bottom: 1.5px solid var(--primary);
  font-size: 12px;
  font-weight: 500;
  color: var(--muted);
  padding: 8px 12px;
}
.data-table td {
  border-bottom: 1px solid var(--border);
  font-size: 13px;
  font-weight: 400;
  padding: 10px 12px;
}
```

### Icon Buttons
```css
.ic-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border: none;
  background: transparent;
}
.ic-btn svg { width: 16px; height: 16px; }
.ic-btn:hover { background: var(--plight); }
```

### Progress Bars — always 3px height
```css
.prog-track {
  height: 3px;
  background: var(--border);
  border-radius: 2px;
  overflow: hidden;
}
.prog-fill {
  height: 100%;
  background: var(--primary);
  border-radius: 2px;
  transition: width 0.3s ease;
}
```

### Modals / Overlays
```css
.overlay-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 24px;
  width: min(480px, 90vw);
  box-shadow: 0 8px 32px rgba(0,0,0,0.12);
}
```

### Nav Items (Sidebar)
```css
.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  color: var(--text);
  font-size: 14px;
  font-weight: 400;
}
.nav-item:hover    { background: var(--phlight); }
.nav-item.active   { background: var(--plight); color: var(--primary); font-weight: 500; }
```

### Section Headers (collapsible)
```css
.sec-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  padding: 12px 0;
}
.sec-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
}
/* Chevron icon gets .rtl-flip for RTL */
```

---

## 8. Single-File HTML/CSS/JS App Conventions

This project uses a single `index.html` with all CSS and JS inline.

**Page navigation pattern:**
```js
function goTo(pageId) {
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  document.getElementById(pageId).style.display = '';
}
```

**Translation pattern:**
```js
const TR = { en: { key: 'value' }, ar: { key: 'قيمة' } };
const t = key => TR[S.lang][key];
// Functions: TR.en.progLbl = (n, total) => `${n} of ${total}`
```

**State object `S`** — single global object for all app state. When adding new fields, add to both initial declaration and any reset/restore logic.

**localStorage pattern:**
```js
// Namespace keys: prefix_field (e.g., skoon_theme, researcher_pin)
localStorage.setItem('skoon_theme', value);
const saved = localStorage.getItem('skoon_theme') || 'light';
```

---

## 9. Visual QA Checklist

Before considering any visual change done, verify:

- [ ] **Light theme** — element looks correct at rest, hover, active
- [ ] **Dark theme** — no hardcoded colours bleed through; chips/badges use deep palette variants
- [ ] **LTR (English)** — layout, spacing, icon direction all correct
- [ ] **RTL (Arabic)** — logical properties flip correctly; chevrons/arrows use `.rtl-flip`; no `left`/`right` breakage
- [ ] **Font sizes** — only 16px / 14px / 12px used; weights only 500 or 400
- [ ] **No yellow, no blue, no red** — all semantics mapped to beach palette
- [ ] **Badge/chip text** — `color: var(--text)` for badges; chip text matches palette spec
- [ ] **Progress bars** — 3px height everywhere
- [ ] **Icon buttons** — 32×32px circle, 16×16px SVG inside
- [ ] **No console errors**
- [ ] **Colour contrast** — text readable in both themes (aim for WCAG AA)

---

## 10. Common Mistakes to Avoid

| ❌ Wrong | ✅ Right |
|---------|---------|
| `color: red` / `color: #FF0000` | `color: var(--danger)` |
| `background: yellow` | `background: #FAF4E6` (cream chip) |
| `padding-left: 12px` | `padding-inline-start: 12px` |
| `margin-right: 8px` | `margin-inline-end: 8px` |
| `right: 10px` (positioned) | `inset-inline-end: 10px` |
| Badge with `color: green` | Badge with `color: var(--text)` |
| Chip with hardcoded bg | Chip using `.chip-hi/.chip-md/.chip-lo` |
| Journey note card with column colour | Journey note card with `var(--surface)` |
| Font size 13px / 15px / 11px | Font size 12px / 14px / 16px only |
| `font-weight: 600` | `font-weight: 500` (max) |
| New colour not in palette | Map to nearest beach/botanical token |

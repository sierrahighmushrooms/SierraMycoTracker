# UI/UX Design Standards

This skill enforces consistent, high-quality UI/UX design across the project. Apply these standards whenever building or modifying user interfaces.

## Typography

Avoid generic system fonts (Arial, Helvetica, Inter, etc.). Use distinctive, intentional font pairings that give the interface character and improve readability.

**Recommended pairing strategy:**
- **Body text:** A clean, readable Sans-serif (e.g., `Geist`, `Manrope`, `Sora`, `Space Grotesk`).
- **Data / numbers / code:** A Mono font (e.g., `JetBrains Mono`, `IBM Plex Mono`, `Fira Code`) for tables, metrics, timestamps, and technical values.
- **Headers / display:** A characterful display font (e.g., `Clash Display`, `Cabinet Grotesk`, `Fraunces`, `Unbounded`) for headings and hero text.

**Implementation:**
```css
:root {
  --font-sans: "Manrope", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", monospace;
  --font-display: "Clash Display", var(--font-sans);
}

body { font-family: var(--font-sans); }
h1, h2, h3 { font-family: var(--font-display); }
.data, .metric, code { font-family: var(--font-mono); }
```

Load fonts via `@font-face` or a font CDN (e.g., Fontshare, Google Fonts) — never fall back to Arial or Inter as the primary choice.

## Palette

Use modern CSS variables with rich neutral tones and exactly **one** sharp accent color. Neutrals should feel warm/deep rather than flat gray.

**Recommended structure:**
```css
:root {
  /* Rich neutrals */
  --bg: #0a0a0b;            /* deep near-black */
  --surface: #141416;       /* elevated panels */
  --surface-2: #1c1c1f;     /* hover / raised */
  --border: #26262b;        /* soft borders */
  --text: #f4f4f5;          /* primary text */
  --text-muted: #a1a1aa;    /* secondary text */

  /* Single sharp accent */
  --accent: #22d3ee;        /* cyan — pick ONE */
  --accent-hover: #67e8f9;
}
```

**Rules:**
- Define all colors as CSS variables — no hardcoded hex values in components.
- Use exactly one accent color. Everything else stays within the neutral scale.
- Accent is reserved for primary actions, active states, and key highlights only.

## Motion

Motion should be subtle and purposeful. Keep transitions fast (150ms–200ms) so the UI feels responsive without being distracting.

**Guidelines:**
- **Hover states:** `transition: all 150ms ease` on interactive elements.
- **Buttons:** Add a subtle scale on hover/active — `transform: scale(1.02)` on hover, `scale(0.98)` on press.
- **Modals / overlays:** Smooth fade-in with a slight upward drift, ~200ms.
- **Focus states:** Visible focus ring using the accent color.

**Implementation:**
```css
button {
  transition: all 150ms ease;
}
button:hover {
  transform: scale(1.02);
}
button:active {
  transform: scale(0.98);
}

.modal {
  opacity: 0;
  transform: translateY(8px);
  transition: opacity 200ms ease, transform 200ms ease;
}
.modal.open {
  opacity: 1;
  transform: translateY(0);
}
```

## Spatial Flow

Prioritize clean negative space and a calm, breathable layout.

**Guidelines:**
- Generous padding and margins — let content breathe; avoid cramped layouts.
- Use **soft borders** (`border-slate-800` or the equivalent neutral border variable) to separate elements instead of heavy shadows or hard lines.
- Use **subtle backdrop blurs** (`backdrop-blur-md`) for floating elements, sticky headers, and modals to create depth.
- Consistent spacing scale (e.g., 4px base: `4, 8, 12, 16, 24, 32, 48`).

**Implementation:**
```css
.card {
  border: 1px solid var(--border);          /* soft border */
  border-radius: 12px;
  padding: 24px;
  background: var(--surface);
}

.sticky-header, .modal-backdrop {
  background: rgba(10, 10, 11, 0.6);
  backdrop-filter: blur(12px);             /* backdrop-blur-md */
  -webkit-backdrop-filter: blur(12px);
}
```

## Checklist

Before considering UI work complete, verify:

- [ ] No generic fonts (Arial/Inter) used — distinctive pairing in place
- [ ] All colors defined as CSS variables with rich neutrals + 1 accent
- [ ] Transitions are 150ms–200ms with button scale effects
- [ ] Modals fade in smoothly
- [ ] Soft borders (`border-slate-800`) and backdrop blurs (`backdrop-blur-md`) applied where appropriate
- [ ] Layout uses clean negative space and consistent spacing
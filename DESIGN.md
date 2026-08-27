---
name: InsightFlow
description: Turn feedback into clear, traceable product decisions.
colors:
  warm-canvas: "oklch(0.975 0.006 85)"
  background: "oklch(0.99 0.003 85)"
  surface: "oklch(1 0 0)"
  ink: "oklch(0.21 0.025 264)"
  muted-surface: "oklch(0.96 0.008 264)"
  muted-ink: "oklch(0.49 0.025 264)"
  hairline: "oklch(0.9 0.012 264)"
  primary: "oklch(0.49 0.2 276)"
  primary-foreground: "oklch(0.985 0 0)"
  primary-soft: "oklch(0.96 0.03 286)"
  info: "oklch(0.52 0.16 252)"
  success: "oklch(0.5 0.14 155)"
  success-soft: "oklch(0.96 0.03 155)"
  warning: "oklch(0.72 0.16 79)"
  warning-soft: "oklch(0.97 0.03 79)"
  warning-ink: "oklch(0.46 0.12 66)"
  danger: "oklch(0.55 0.2 25)"
  danger-soft: "oklch(0.96 0.03 25)"
  planned: "oklch(0.68 0.13 203)"
  sidebar: "oklch(0.975 0.006 264)"
  sidebar-active: "oklch(0.93 0.025 276)"
  sidebar-active-foreground: "oklch(0.32 0.12 276)"
typography:
  display:
    fontFamily: "Manrope, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1.111
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Manrope, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.556
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Manrope, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.375
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.5rem"
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.455
    letterSpacing: "0.08em"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "10": "40px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "36px"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "36px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "4px 10px"
    height: "32px"
  card-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "20px"
  chip-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    rounded: "{rounded.md}"
    padding: "4px 8px"
  chip-warning:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning-ink}"
    rounded: "{rounded.md}"
    padding: "4px 8px"
  chip-success:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success}"
    rounded: "{rounded.md}"
    padding: "4px 8px"
  navigation-active:
    backgroundColor: "{colors.sidebar-active}"
    textColor: "{colors.sidebar-active-foreground}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
    height: "40px"
  decision-brief:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.background}"
    rounded: "{rounded.xl}"
    padding: "20px 24px"
---

# Design System: InsightFlow

## Overview

**Creative North Star: "The Decision Brief"**

**FORM Metadata:** `inherited-world/no-concept-round`. This surface inherits the visual system explicitly established in `PRODUCT.md`; no concept seed or QUALITY BAR card was required.

InsightFlow should feel like a calm operational briefing prepared for someone who must decide where to intervene. Warm paper-like space and cool blue-gray structure keep the environment credible and quiet; a concentrated indigo voice marks selection and action, while semantic colors make risk and progress immediately legible.

The interface is intentionally not a uniform dashboard mosaic. It moves through a decision story: organization state, the intervention that deserves attention, evidence and trends, then project-level health. Density is operational but measured, with clean lines, concise copy, tabular numbers, and responsive transformations that preserve scanability.

**Key Characteristics:**

- A decision sequence instead of a grid of equal-weight cards.
- Warm white canvas, crisp evidence surfaces, and cool structural neutrals.
- Indigo and violet accents used selectively for action, focus, and current state.
- Green, amber, red, blue, and cyan signals paired with text or icons.
- Manrope headings and Inter interface copy with restrained tracking.
- Flat tonal layering, fine boundaries, and no decorative shadows at rest.
- Persistent desktop sidebar that collapses to icons; compact mobile header opens the same navigation in an off-canvas sheet.

## Colors

The palette pairs a warm, quiet canvas with blue-gray structure, a focused indigo product voice, and explicit operational semantics.

### Primary

- **Decision Indigo** (`colors.primary`): primary actions, selected states, chart emphasis, and the clearest directional cues.
- **Violet Wash** (`colors.primary-soft`): avatar fields, gentle selection backgrounds, and supporting emphasis that must remain quieter than the primary.

### Tertiary

- **Evidence Blue** (`colors.info`): informational movement and received-feedback states.
- **Resolution Green** (`colors.success`, `colors.success-soft`): completed work, healthy projects, and positive movement.
- **Attention Amber** (`colors.warning`, `colors.warning-soft`, `colors.warning-ink`): stale work and states that need attention but are not critical.
- **Intervention Red** (`colors.danger`, `colors.danger-soft`): critical items, at-risk projects, and unowned urgent work.
- **Planned Cyan** (`colors.planned`): planned feedback in multi-status evidence views.

### Neutral

- **Warm Briefing Canvas** (`colors.warm-canvas`, `colors.background`): the page field and compact navigation surfaces.
- **Evidence White** (`colors.surface`): tables, charts, lists, and metric containers.
- **Blue-Gray Ink** (`colors.ink`): primary text and the high-contrast Decision Brief.
- **Quiet Structure** (`colors.muted-surface`, `colors.muted-ink`, `colors.hairline`): secondary copy, inactive controls, dividers, chart grids, and low-priority grouping.
- **Navigation Slate** (`colors.sidebar`, `colors.sidebar-active`, `colors.sidebar-active-foreground`): persistent desktop navigation and its current state.

**The Scarce Accent Rule.** Indigo identifies selection, focus, action, or meaningful change; it is never a decorative fill pattern.

**The Evidence Has a Color Rule.** Semantic hues always travel with text, an icon, a label, or position so meaning never depends on color alone.

## Typography

**Display Font:** Manrope (with sans-serif fallback)

**Body Font:** Inter (with sans-serif fallback)

**Character:** Manrope gives headings and decision numbers a compact, assured voice. Inter carries dense operational copy, labels, and controls without drawing attention away from the evidence.

### Hierarchy

- **Display** (`typography.display`): page titles and the largest metric values; use sparingly to open a decision context.
- **Headline** (`typography.headline`): panel and brief headlines that introduce one operational idea.
- **Title** (`typography.title`): product identity, card titles, and compact section anchors.
- **Body** (`typography.body`): descriptions, activity copy, table content, and control text; explanatory prose stays near a 65-character measure.
- **Label** (`typography.label`): small navigation group labels in uppercase; ordinary chips and metadata remain sentence case.

**The Two-Level Voice Rule.** Manrope names decisions and key evidence; Inter explains, labels, and lets people operate.

## Layout

Desktop uses a persistent 256px sidebar that can collapse to a 48px icon rail and a fluid content canvas capped at 1520px. The main content follows an 8px rhythm with a 4px half-step for fine alignment, generous horizontal gutters, and deliberate bands rather than identical floating cards. Metric summaries form one connected strip; analysis panels use asymmetric columns; intervention and activity sit together; project health closes the story.

At the medium breakpoint the sidebar owns navigation and the content shifts beside it. On smaller screens, a compact top header opens the sidebar as an off-canvas sheet, preserving one navigation model across devices. Multi-column sections stack, control groups wrap, the metric strip becomes a readable vertical sequence, and the project table changes into project cards instead of compressing desktop columns.

**The Decision-First Rule.** Order every dashboard from overall state to priority intervention, supporting evidence, and finally the health of individual projects.

## Elevation & Depth

Dashboard surfaces are flat at rest and use no decorative shadows. Depth comes from warm-to-white tonal changes, thin dividers, low-contrast rings, and the single dark Decision Brief. Shadows belong only to transient overlays such as menus or sheets, where separation from the current task is functional.

**The Flat Evidence Rule.** A resting card earns hierarchy through placement, tone, and boundary—not a floating shadow.

## Shapes

The form language is gently geometric: compact controls use the large control radius, badges use the medium radius, and major containers use the extra-large radius. Corners stay restrained enough to support dense information. Progress tracks and status dots may be fully rounded; people and product marks may use either circular or softly squared frames according to their context.

**The Contained Curve Rule.** Round the component enough to group it, never enough to make operational surfaces feel playful or pill-heavy.

## Components

### Buttons

- **Shape:** compact rounded controls with medium-weight labels and clear icon alignment.
- **Primary:** Decision Indigo with light text; reserve it for the strongest available action.
- **Hover / Focus:** darken or soften the assigned semantic background, then show a visible three-pixel focus ring and border shift.
- **Outline / Ghost / Link:** outline controls carry filters and secondary actions; ghost and link treatments handle local or tertiary actions without competing with the page decision.

### Chips

- **Style:** soft semantic fields with strong matching text, concise labels, and optional icons.
- **State:** danger, warning, and success variants distinguish operational meaning; selection is not conveyed by color alone.

### Cards / Containers

- **Corner Style:** restrained extra-large corners for major panels.
- **Background:** Evidence White over the Warm Briefing Canvas.
- **Shadow Strategy:** flat by default, with a low-contrast boundary ring or divider.
- **Border:** hairlines divide headers, rows, and grouped metrics.
- **Internal Padding:** compact 20px to 24px spacing, reduced carefully on narrow screens.

### Inputs / Fields

- **Style:** transparent or surface-colored fields with a visible hairline, compact height, and large control corners.
- **Focus:** the border moves to the indigo focus color and gains a visible three-pixel translucent ring.
- **Error / Disabled:** error uses the danger pair; disabled controls remain legible and visibly inactive without disappearing.

### Navigation

Desktop navigation is a quiet cool sidebar with one soft indigo current-state row, concise group labels, and clear keyboard focus. It collapses to an icon rail with tooltips and reopens through the persistent header trigger. Mobile uses that same trigger to open an off-canvas sheet, keeping destinations and account access consistent without duplicating navigation.

### Decision Brief

The signature container is a dark, full-width operational summary placed before the metrics. It states the current organizational reading, explains the evidence in plain language, names the first project to review, and keeps one clear follow-up action at the edge or below on mobile.

### Metric Summary

Core metrics live in one connected band, not four detached promotional cards. Dividers create rhythm, tabular figures support comparison, and a small directional marker plus semantic phrase explains change without turning the numbers into decoration.

### Evidence Panels

Charts, attention queues, activity, and project health share aligned headers, concise explanatory copy, and hairline row structure. Tables remain tables on medium and larger screens; on mobile, project health becomes a compact card list with the same data and status language.

**The One Intervention Rule.** The darkest surface on the page is reserved for the single operational conclusion that should change what the user does next.

## Do's and Don'ts

### Do:

- Do preserve the state → intervention → evidence → project-health reading order.
- Do use semantic CSS tokens for every product color and keep component code free of hardcoded palette values.
- Do pair color with labels, icons, numbers, or placement for every status and trend.
- Do use tabular numerals and aligned columns wherever people compare operational values.
- Do transform dense tables into readable cards or focused rows on mobile.
- Do reserve the Decision Brief for one evidence-backed conclusion and one next action.

### Don't:

- Don't turn the dashboard into a uniform mosaic of equal cards.
- Don't use shadows to decorate resting dashboard surfaces or manufacture hierarchy.
- Don't spread indigo across large areas when neutral structure can carry the layout.
- Don't use red, amber, green, blue, or cyan as decoration detached from operational meaning.
- Don't squeeze desktop tables, sidebars, or multi-column controls into the mobile viewport.
- Don't introduce highly pill-shaped controls, oversized radii, gradients, or ornamental effects that weaken the calm briefing character.

# Panel Minimize / Dock Collapse — Design Spec

**Date:** 2026-04-08
**Status:** Approved

---

## Overview

Add collapsible side panels to the game-master dashboard view. Users can minimize the Stats/AI GM panel (left) and the Chat panel (right) to reclaim screen space for the tactical map. The system is mobile-conscious: desktop uses edge collapse handles, mobile uses bottom drawers.

---

## Architecture

### Layout changes — `page.tsx`

The 3-column flex layout transitions from hardcoded widths to CSS-driven collapse:

- Left panel wrapper: `w-[320px]` → `w-0` via `transition-all duration-300 ease-in-out overflow-hidden`
- Right panel wrapper: `w-[380px]` → `w-0` via same
- Center `TacticalMap` is already `flex-1 min-w-0` — expands automatically to fill vacated space, no extra logic

Panels are **never unmounted** when collapsed — content stays mounted to preserve scroll position, chat state, and log position. Visibility is controlled by width + overflow.

### State — `usePanelState` hook (`src/hooks/use-panel-state.ts`)

```ts
// Returns
{
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  toggleLeft: () => void;
  toggleRight: () => void;
}
```

- Persists to `localStorage` under key `"dashboard-panel-state"`
- Default: both panels expanded
- SSR-safe (reads localStorage inside `useEffect`)

---

## Desktop Behavior

- **Collapse button:** Small rounded pill (`h-8 w-5`) centered vertically on the inner edge of each panel border. Shows `◀` (collapse) when expanded, `▶` (restore) when collapsed.
- **Styling:** `glass-card border-white/[0.04]` consistent with existing aesthetic. `aria-label` set for accessibility.
- **Collapsed state:** Button repositions to a floating restore pill anchored to the screen edge (`left-0` for left panel, `right-0` for right panel), vertically centered.
- **Content fade:** Panel content transitions `opacity-0` as it collapses to prevent text clipping during width animation.
- **Map expansion:** Automatic via flex — no JS required.

---

## Mobile Behavior (`< 768px`)

- **Layout:** 3-column flex is replaced. Map takes full width and full remaining height.
- **Panels become bottom drawers:** Full-width sheets that slide up via `translate-y` transitions (`translate-y-0` open, `translate-y-full` hidden). They overlay the map (don't push it).
- **Triggers:** Two floating action buttons in the bottom corners of the map:
  - Bottom-left: toggles Stats/AI GM panel (sliders icon)
  - Bottom-right: toggles Chat panel (chat bubble icon)
  - Styled with existing `tactical-btn` aesthetic
- **Mutual exclusion:** Opening one drawer closes the other.
- **Drawer constraints:** `max-height: 85vh` with internal scroll. Drag handle at top for visual affordance.
- **Backdrop:** Semi-transparent overlay covers map when a drawer is open. Tapping it closes the drawer.

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `src/hooks/use-panel-state.ts` | Create — panel collapse state + localStorage persistence |
| `src/app/dashboard/page.tsx` | Modify — wire up `usePanelState`, apply collapse classes, add collapse buttons, add mobile drawer/FAB structure |
| `src/components/dashboard/stats-panel.tsx` | No changes |
| `src/components/dashboard/chat-panel.tsx` | No changes |

---

## Out of Scope

- Server Config and Mods views (already full-width, no side panels)
- Resizable panels (drag to resize) — collapse is binary
- Per-server panel state — one shared state across all servers

# Dashboard Layout Quality Pass (2026-04-11)

Covers the layout audit deferred from the overflow-fix session (77845ef).

## Issues Found and Fixed

### 1. ServerStats as third flex column (Dashboard.jsx:135)

ServerStats card was the third child of the `flex-1 flex-row gap-3 min-h-0` container alongside the
left column (w-[380px]) and right column (flex-1). As a flex item with no explicit width, it sized
to its intrinsic content width (~300px from tab buttons). This left the right column (Players +
Console) with:

- 1440px viewport: fine (~600px for right col)
- 1280px viewport: cramped (~300px for right col)
- 1024px viewport: broken (~70px for right col after sidebar 210 + padding 40 + left 380 + gap 12 + ServerStats ~300 + gap 12)

**Fix:** Moved ServerStats outside the flex-row container to the outer flex-col, placing it below
the two-column layout as a full-width content-height block. It scrolls below the fold rather than
collapsing the right column.

### 2. Players list unbounded height (Dashboard.jsx:109)

The players list container had no max-height. `shrink-0` on the Players card meant it grew to full
content height. On a 64-player server (~58px per row × 64 = ~3700px), the card consumed the entire
right column and the Console received near-zero flex-1 space.

**Fix:** Added `max-h-[240px] overflow-y-auto` to the inner list div. Shows ~4 players, scrollable
for more. Console retains its flex-1 space regardless of player count.

## Non-Issues Investigated

- `w-[380px]` left column — correct at 1024px+ viewports (leaves ~382px for right col with sidebar)
- Chart height fixed at 110px — intentional, no change
- StatBox label truncation — labels are short (CPU/RAM/etc.), no overflow risk
- Console `flex-1 min-h-0` pattern — correct

## Files Changed
- `frontend/src/tabs/Dashboard.jsx`

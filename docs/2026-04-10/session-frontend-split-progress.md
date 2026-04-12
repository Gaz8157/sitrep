# Frontend Split — Session Progress (2026-04-10)

> **STATUS AS OF THIS HANDOFF:** Tasks 1–5 committed and verified. Tasks 6, 7, 8 pending. Mark explicitly halted further progression to capture this report. **Do not start Task 6 without Mark's explicit go-ahead.**

Tracks every change made during the frontend monolith split sessions so a context wipe can never lose work that's already on disk. Read this top-down before resuming.

## Where everything lives

- **Repo:** `/opt/panel` (branch `dev` only — never `main`)
- **Plan:** `/opt/panel/docs/superpowers/plans/2026-04-10-frontend-split.md`
- **Backups:** `/opt/panel/backups/snapshot-YYYYMMDD-HHMMSS-*.tar.gz`
- **Monolith source:** `/opt/panel/frontend/src/App.jsx` (5380 lines, **untouched until Task 8**)
- **Extracted files:** `/opt/panel/frontend/src/{api.js,constants.js,ctx.jsx,hooks.js,components/ui.jsx,tabs/*.jsx}`

## Commit ledger (dev branch, oldest → newest)

| Commit | Task | What |
|--------|------|------|
| `77df842` | Task 1 | Extract `api.js`, `constants.js`, `ctx.jsx`, `hooks.js` |
| `8e73881` | Task 2 | Extract `components/ui.jsx` (Badge, Btn, Card, StatBox, Bar, Toggle, SrcTag, Input, Empty, Modal, Toasts, FloatingPanel) |
| `077bb43` | Task 3 | Extract `tabs/Auth.jsx`, `tabs/Permissions.jsx` (default Permissions, named ServerStats), `tabs/Dashboard.jsx`, `tabs/Console.jsx` |
| `c6eb6ef` | n/a | (Other session) PlayerTracker tab added |
| `05f51a6` | Task 4 | Extract `tabs/Startup.jsx` (StartupDiagnostics + Saves locals + Startup default), `tabs/Admin.jsx` (safeParse + SortBtn locals + Admin default), `tabs/Config.jsx` (VANILLA_SCENARIOS + ScenarioField + DynVal + DynObj + DEFAULT_SERVER_CONFIG locals + Config default) |
| `e032c94` | n/a | (Other session) `fix(tracker): trust localhost for mod auth; add wired_up staleness window` — landed mid-Task-5 |
| `7750bca` | Task 5 | Extract `tabs/Mods.jsx` (ModCard local + WS_TAGS imported from constants + Mods default), `tabs/Files.jsx`, `tabs/Webhooks.jsx`, `tabs/Network.jsx` |

> The other-session commit `e032c94` landed in between my Task 4 and Task 5 commits. My commit applied cleanly on top — no conflicts — but it's a real example of why parallel-session backups matter.

## Task status

| # | Status | Task |
|---|--------|------|
| 1 | ✅ committed `77df842` | Create shared infrastructure |
| 2 | ✅ committed `8e73881` | Write shared UI components |
| 3 | ✅ committed `077bb43` | Extract Auth/Permissions/Dashboard/Console |
| 4 | ✅ committed `05f51a6` | Extract Startup/Admin/Config |
| 5 | ✅ committed `7750bca` | Extract Mods/Files/Webhooks/Network |
| 6 | ⏸ **HALTED — awaiting Mark** | Extract AiGm/Scheduler/Profile |
| 7 | ⏸ pending | Extract ServerPicker (with NewServerCard helper) |
| 8 | ⏸ pending | Rewrite App.jsx as routing shell, wire imports, delete dead in-monolith copies, push to dev |

## Verified function locations in App.jsx

These have drifted from plan line numbers — use the verified ones. **The plan's import lists are also stale — re-grep each extracted source range for actual symbol usage before writing import headers.**

| Function / Const | Line | Notes |
|------------------|------|-------|
| ModCard | 1566 | local helper to Mods (not exported) — **already in `Mods.jsx`** ✓ |
| WS_TAGS const | 1587 | constant lives in `constants.js:125`, NOT redefined in Mods.jsx |
| Mods | 1589 | default export — **in `Mods.jsx`** ✓ |
| Files | 2006 | default export — **in `Files.jsx`** ✓ |
| Webhooks | 2248 | default export (one dense line) — **in `Webhooks.jsx`** ✓ |
| Network | 2252–2281 | default export — **in `Network.jsx`** ✓ |
| TC const | 2282 | constant block used by AiGm |
| ESC_NAMES/ESC_DESC/ESC_COLORS | 2289–2291 | used by AiGm |
| QUICK_CMDS | 2292 | used by AiGm |
| FloatingPanel | 2321 | already in `components/ui.jsx`, monolith copy is dead code |
| OpordSection | 2357 | local helper to AiGm |
| OpordField | 2369 | local helper to AiGm |
| HwBar const | 2378 | helper used somewhere in AiGm region |
| **AiGm** | **2381** | default export, **very large (~1300 lines)** |
| Scheduler | 3774 | default export |
| Saves | 3785 | already in `tabs/Startup.jsx` as local helper ✓ — do not duplicate |
| NewServerCard | 3932 | helper for ServerPicker |
| **ServerPicker** | **4062** | default export |
| ProfileModal | 5072 | exported by Profile.jsx |
| AvatarWidget | 5145 | exported by Profile.jsx, also imported by ServerPicker + App |
| ProfileDropdown | 5165 | exported by Profile.jsx |

## Extracted file inventory

```
frontend/src/
├── api.js                  (Task 1)        — committed 77df842
├── constants.js            (Task 1)        — committed 77df842  (WS_TAGS lives here at line 125)
├── ctx.jsx                 (Task 1)        — committed 77df842
├── hooks.js                (Task 1)        — committed 77df842
├── components/
│   └── ui.jsx              (Task 2)        — committed 8e73881  (55 lines, dense one-liners + FloatingPanel)
└── tabs/
    ├── Auth.jsx            (Task 3)        — 195 lines
    ├── Permissions.jsx     (Task 3)        — 241 lines (default Permissions, named ServerStats)
    ├── Dashboard.jsx       (Task 3)        — 125 lines
    ├── Console.jsx         (Task 3)        — 102 lines
    ├── Startup.jsx         (Task 4)        — 331 lines (incl. StartupDiagnostics + Saves locals)
    ├── Admin.jsx           (Task 4)        — 490 lines (incl. safeParse + SortBtn locals)
    ├── Config.jsx          (Task 4)        — 87 lines (incl. ScenarioField + DynVal + DynObj + DEFAULT_SERVER_CONFIG)
    ├── Mods.jsx            (Task 5)        — 444 lines (incl. ModCard local; imports WS_TAGS from constants.js)
    ├── Files.jsx           (Task 5)        — 247 lines
    ├── Webhooks.jsx        (Task 5)        — 9 lines (single dense one-liner)
    ├── Network.jsx         (Task 5)        — 35 lines
    └── Tracker.jsx         (other session) — 683 lines (PlayerTracker, unrelated to split)
```

**None of these are imported by App.jsx yet.** The monolith still owns everything at runtime — every extracted function has a duplicate copy still living inside `App.jsx`. Task 8 wires the imports and deletes the in-monolith copies.

## Verified imports per Task 5 file (each grepped against extracted source)

**Mods.jsx**
```jsx
import { useState, useEffect, useMemo, useRef } from 'react'
import { useT } from '../ctx.jsx'
import { API, post, put, del, authHeaders, on401 } from '../api.js'
import { useFetchOnce, useMobile } from '../hooks.js'
import { Badge, Btn, Card, Empty } from '../components/ui.jsx'
import { WS_TAGS } from '../constants.js'
```
Plan claimed Input/Modal/SrcTag/Toggle/KNOWN_ADMIN_MODS — none used in source. ModCard kept local.

**Files.jsx**
```jsx
import { useState, useCallback } from 'react'
import { useT } from '../ctx.jsx'
import { API, post, put, authHeaders, on401 } from '../api.js'
import { useFetchOnce, useMobile } from '../hooks.js'
import { Btn } from '../components/ui.jsx'
```
Plan claimed Card/Input/Modal/Empty — none used. The string "Empty" appears once but as the literal `'Empty folder'` text, not the component.

**Webhooks.jsx**
```jsx
import { useState, useEffect } from 'react'
import { useT } from '../ctx.jsx'
import { API, put, post } from '../api.js'
import { useFetchOnce } from '../hooks.js'
import { Badge, Btn, Card, Toggle, Input } from '../components/ui.jsx'
```

**Network.jsx**
```jsx
import { useEffect } from 'react'
import { AreaChart, Area, Tooltip, ResponsiveContainer } from 'recharts'
import { useT } from '../ctx.jsx'
import { API } from '../api.js'
import { useFetch, useFetchOnce, useHistory, useMobile } from '../hooks.js'
import { Btn, Card } from '../components/ui.jsx'
```
Plan claimed XAxis/YAxis/Badge/useState — none used. recharts: only Area chart components.

## Mechanical extraction methodology (use this for Tasks 6–7)

To guarantee byte-identical bodies and avoid manual transcription errors in dense JSX:

```bash
# 1. Extract function body byte-identical from App.jsx
awk 'NR==<startline>{sub(/^function /,"export default function ")} NR>=<startline> && NR<=<endline>' \
  /opt/panel/frontend/src/App.jsx > /tmp/body.jsx

# 2. Write the verified import header to /tmp/header.jsx, then concatenate
cat /tmp/header.jsx /tmp/body.jsx > /opt/panel/frontend/src/tabs/<Name>.jsx

# 3. Verify byte-identical extraction (must show empty diff, exit 0)
diff <(awk 'NR>=<startline> && NR<=<endline>{sub(/^function /,"export default function ");print}' \
  /opt/panel/frontend/src/App.jsx) \
  <(sed -n '<header_lines+1>,$p' /opt/panel/frontend/src/tabs/<Name>.jsx)

# 4. Syntax check (NOTE: --loader:.jsx=jsx with extension form, NOT --loader=jsx)
cd /opt/panel/frontend && npx esbuild --loader:.jsx=jsx --bundle=false src/tabs/<Name>.jsx > /dev/null

# 5. Full build verification
cd /opt/panel/frontend && npm run build
```

**Import verification loop** — for each extracted source range, grep for every candidate symbol and only include those with count > 0:

```bash
for sym in useState useEffect useMemo useRef useCallback Badge Btn Card Input Empty Modal Toggle SrcTag Bar StatBox Toasts FloatingPanel API post put del authHeaders on401 useFetch useFetchOnce useHistory useMobile useT; do
  c=$(grep -cw "$sym" /tmp/body.jsx)
  [ "$c" -gt 0 ] && echo "$sym=$c"
done
```

## Uncommitted modifications NOT from this split work

Other-session edits sitting in the working tree at handoff time. **Do not touch unless asked:**

- `backend/main.py` — likely follow-on tracker tweak from same other session that produced `e032c94`
- `frontend/src/tabs/Tracker.jsx` — likely follow-on tracker tweak

`git status` at handoff:
```
On branch dev
Your branch is ahead of 'origin/dev' by 3 commits.
Changes not staged for commit:
        modified:   backend/main.py
        modified:   frontend/src/tabs/Tracker.jsx
Untracked files:
        backups/
        docs/
        scraper/
```

The 3 commits ahead of origin are `05f51a6`, `e032c94`, `7750bca`. **Do not push** without Mark's explicit instruction (durable rule: only Mark promotes to/from origin and main).

## Backup snapshots

Run from `/opt/panel`:

```bash
TS=$(date +%Y%m%d-%H%M%S)
tar czf "backups/snapshot-${TS}-frontend-split-<label>.tar.gz" \
  frontend/src backend/main.py docs/superpowers/plans/2026-04-10-frontend-split.md \
  docs/session-2026-04-10-frontend-split-progress.md
```

Existing snapshots:

- `backups/snapshot-20260410-224712-frontend-split-task5.tar.gz` — pre-Task-5 (before Mods/Files/Webhooks/Network on disk)
- `backups/snapshot-20260410-225307-frontend-split-task5-done.tar.gz` — post-Task-5 commit `7750bca`

> Take a fresh tarball at the start of each task and immediately after each commit. Parallel sessions have clobbered work before — see the "Session wipe incident" memory.

## Resume instructions for next session

1. **Read this file in full first.** Don't trust the plan's line numbers or import lists — they have been stale every single task so far.
2. `cd /opt/panel && git status && git log --oneline -10` — verify branch is `dev` and HEAD is `7750bca` (or includes it). If origin has new commits or another session committed since, **stop and reconcile before touching anything**.
3. Check that the parallel-session uncommitted changes (`backend/main.py`, `frontend/src/tabs/Tracker.jsx`) are still untouched in working tree, or have been committed by their owning session. Either way, leave them alone.
4. Take a fresh backup tarball before starting work.
5. Re-verify Task 6 function line numbers — App.jsx may have shifted if the parallel session edited it. The current verified-against-line-numbers in this doc were captured at HEAD `7750bca`.
6. **Task 6 strategy** (when Mark gives the go-ahead):
   - AiGm is ~1300 lines and has two local helpers (OpordSection at 2357, OpordField at 2369). Extract the whole region 2357→end-of-AiGm into `tabs/AiGm.jsx` with `export default function AiGm` rewrite via the awk substitution. Constants TC/ESC_*/QUICK_CMDS/HwBar live just before — decide whether they belong in `tabs/AiGm.jsx` or `constants.js` based on whether anything else uses them (grep first).
   - Scheduler at 3774 is small — separate file `tabs/Scheduler.jsx`.
   - Profile.jsx exports three things: ProfileModal (5072), AvatarWidget (5145), ProfileDropdown (5165). AvatarWidget is also referenced from ServerPicker (Task 7) and from App.jsx's main shell — that's fine, exports work.
   - Each extracted file: import header → mechanical awk body → diff verify → esbuild syntax check → npm run build → isolated git add → commit.
7. **Task 7 strategy:** ServerPicker (4062) uses NewServerCard (3932) and AvatarWidget (from Profile.jsx). Extract NewServerCard as a local helper in `tabs/ServerPicker.jsx`, import AvatarWidget from `tabs/Profile.jsx`.
8. **Task 8 strategy:** This is the dangerous one. Rewrite App.jsx as a routing shell that imports all the new files and deletes the now-dead in-monolith copies. Take a backup BEFORE starting Task 8 and after each major chunk. Build after each deletion. Probably want to do this in stages: first add the imports at the top, then delete the duplicates one tab at a time, building after each deletion to catch any "oh wait, this still references that local helper" issues.

## Durable rules the session must respect

1. **`dev` branch only** — never commit to `main`, never push, Mark promotes manually.
2. **Mechanical extraction over manual typing** — awk substitution to guarantee byte-identical bodies.
3. **Verify imports by grep, not by trusting the plan.** The plan has been wrong about imports every task.
4. **Backup before and after each commit.** Parallel sessions exist and have clobbered work.
5. **Stage only your own files when committing** (`git add frontend/src/tabs/X.jsx Y.jsx ...`) — never `git add -A`. Other sessions' uncommitted edits in the working tree must stay isolated.
6. **No chatty comments** in extracted files. Mechanical extraction preserves the original code as-is — don't add explanatory banners or rationale comments.
7. **If anything is uncertain — line numbers shifted, a symbol is ambiguous, a build fails — stop and ask Mark.** Don't guess and don't bypass.

## Quality verification checklist applied to Task 5 commits

- [x] Each file's body is byte-identical to its source range in App.jsx (verified via diff, exit 0)
- [x] Each file passes `npx esbuild --loader:.jsx=jsx --bundle=false`
- [x] Full `npm run build` succeeds (`✓ built in 173ms` after Task 5)
- [x] Imports verified by grepping the extracted source for actual symbol usage
- [x] Only `frontend/src/tabs/{Mods,Files,Webhooks,Network}.jsx` staged for commit `7750bca` (no contamination from other sessions' working-tree edits)
- [x] Post-commit backup tarball created
- [x] Working tree clean of my own changes after commit

## Why progression is halted at this point

After Task 5 commit landed cleanly, Mark issued: *"I would also like a documented report of all your changes and instructions and context written for the next session to pick up where you left off and stop anymore progression"*. Earlier in the session he had also said *"document all your changes and make backups we just had a session wipe almost everything"* and *"continue with caution make sure you know what your task is and you know what you are doing before continueing be honest whats the current session tokens at can you continue and present quality work?"*.

Task 6 (AiGm) is the riskiest single extraction in the plan because AiGm alone is ~1300 lines. Given the explicit halt directive, it is left for the next session — which should be started fresh with full context budget for the AiGm work.

**Do not continue with Task 6 without Mark's explicit go-ahead.**

# Session 017 — Contextual Help System

**Date:** March 2026
**Version:** v0.12.0

---

## Summary

Session 017 added a self-documenting contextual help system. Major sections have a small (i) info button that opens a popover explaining the section, with an embedded ephemeral AI chat for follow-up questions. These conversations are not saved — they exist purely so users can get immediate help without navigating away.

**Iteration 2:** The popover was rendered inside the component's own DOM, which caused three compounding issues: (1) Financial Health's `overflow-hidden` clipped the popover, (2) sibling card stacking contexts meant the Account card's (i) button rendered _above_ the Equities popover, and (3) that same z-index issue made the chat input unclickable. Fixed by rewriting InfoPopover to use a **React Portal** (`createPortal` to `document.body`), which escapes all overflow clipping and stacking contexts. The popover is now positioned with `getBoundingClientRect()` and `fixed` positioning, with scroll/resize listeners to stay anchored.

**Iteration 3:** Two remaining bugs — (1) the popover for bottom-of-page cards (Account) extended below the viewport and was invisible, and (2) the AI chat Send button still did nothing (third report). Root causes: the positioning code incorrectly added `window.scrollY`/`window.scrollX` to `position: fixed` coordinates (fixed positioning is viewport-relative, not document-relative), and the `useCallback`-based `handleSubmit` suffered stale closure issues inside the React Portal. Fixed by removing scroll offsets, adding flip-to-above logic when there's no room below, and replacing the `useCallback` + `<form onSubmit>` pattern with a plain `async function doSend()` that reads input from a `useRef` instead of state closure, with explicit `onClick` on the button and `onKeyDown` Enter handler on the input.

---

## Features Implemented

### 1. InfoPopover Component

**File created:** `frontend/components/InfoPopover.tsx` (~340 lines)

A fully reusable contextual help component with three modes:

- **Trigger** — A small (i) icon button, visible but inconspicuous. Available in two sizes (`sm` / default).
- **Popover** — Click the (i) to open a popup rendered via **React Portal** (`createPortal`) directly on `document.body`. Positioned with `getBoundingClientRect()` + `fixed` CSS. Widens from `w-80` to `w-96` in chat mode.
- **Ephemeral AI Chat** — Click "Have a question? Ask AI..." to expand a chat input. AI streams back answers via SSE. Disclaimer: "Quick help · These chats are not saved."

Props: `title`, `description`, `tips[]`, `sectionContext`, `size?`

Key behaviors:

- Portal rendering escapes all `overflow: hidden` and stacking context issues
- Outside-click detection checks both trigger ref and popover ref (now in different DOM locations)
- Escape key closes the popover
- Scroll and resize listeners keep the popover anchored to the trigger
- Chat uses direct `onClick` button handler and `onKeyDown` Enter handler — no `<form>` element (avoids React Portal event delegation issues)
- Input value tracked via `useRef` alongside state — `doSend()` reads from the ref to guarantee a fresh value regardless of closure timing
- SSE streaming uses the `/api/chat/ask` endpoint with a local `finished` flag to avoid stale-closure duplicate messages
- Popover flips above the trigger when there isn't enough viewport space below (e.g., Account card at bottom of page)
- Uses `position: fixed` with pure viewport coordinates from `getBoundingClientRect()` — no `scrollY`/`scrollX` offset
- `sectionContext` is passed to the AI so it knows which part of the app the user is asking about

### 2. Backend Ephemeral AI Endpoint

**Files modified:**

- `backend/chat/router.py` — Added `EphemeralAskRequest` model and `POST /api/chat/ask` endpoint
- `backend/chat/ai_service.py` — Added `stream_ai_response_ephemeral()` function

The ephemeral endpoint:

- Accepts `{ question, context }` where context is the section name
- Streams response via SSE with `{type: 'chunk', text}` and `{type: 'done'}` events
- Uses the same Gemma 3 model cascade as the main chat
- Shorter `max_output_tokens` (512 vs 2048) for concise popover-style answers
- System prompt tells the AI: "The user is currently looking at the '{section_context}' section. Keep answers concise and directly relevant."
- **Nothing is persisted** — no conversation, no messages saved to the database

### 3. Dashboard Integration

**File modified:** `frontend/app/dashboard/page.tsx`

- Added an InfoPopover next to the "Welcome back" heading (explains the dashboard)
- Each of the 4 section cards (Assets, Equities, Portfolio, Account) has an (i) button in the top-right corner
- Cards restructured from `<Link>` to `<div>` wrapper + `<Link>` inside, so the info button click doesn't trigger navigation
- Section-specific descriptions and tips for each card

### 4. Financial Health Integration

**File modified:** `frontend/components/FinancialHealth.tsx`

- Added InfoPopover next to the "Financial Health" heading
- Explains what the score measures and how to improve it
- Tips cover document uploads, diversification, and goal-setting

### 5. Sidebar — Reverted (No Info Buttons)

**File modified:** `frontend/components/Sidebar.tsx`

- Sidebar info buttons were added initially but removed after user review — they looked tacky in the narrow sidebar. The sidebar is restored to its original clean state.

---

## Bugs Fixed

### Iteration 1: Ephemeral AI chat not sending messages

**Root causes:**

1. **Stale closure on `streaming` state** — After SSE stream processing, the fallback check `if (streaming)` always read `true` from the closure, causing duplicate messages to be appended. Fixed by using a local `finished` boolean flag instead of relying on React state.

2. **`<div>` with `onKeyDown` for form submission** — Replaced with a proper `<form onSubmit>` wrapping the input and send button. This ensures both Enter key and button click reliably trigger `sendQuestion()`.

3. **Popover too narrow for chat** — Added `transition-all` and dynamic width (`w-80` → `w-96` when chat mode is active) so there's room for the conversation.

### Iteration 2: Popover clipped, z-index conflicts, chat still unclickable

**Root causes:**

1. **Financial Health popover clipped** — The `FinancialHealth` component's outer div uses `overflow-hidden` for rounded corners. Since the popover was rendered inside this div, it was clipped. Fixed by rendering via **React Portal** to `document.body`.

2. **Z-index stacking context** — Each dashboard card has `position: relative`, creating separate stacking contexts. The Account card (later in DOM) rendered its (i) button above the Equities card's open popover, even though the popover had `z-50`. Stacking contexts don't cross sibling boundaries. Fixed by portaling — the popover is now at `document.body` level with `z-index: 9999`.

3. **Chat input/button unclickable** — Direct consequence of issue #2. The sibling card's elements intercepted clicks on the chat form. Portal fix resolved this completely.

4. **Position tracking** — Portal-rendered popover uses `getBoundingClientRect()` + `fixed` positioning with `scroll` and `resize` event listeners to stay anchored to the trigger button.

### Iteration 3: Popover goes off-page, chat Send button still broken

**Root causes:**

1. **Popover positioned off-screen for bottom cards** — The positioning code used `position: fixed` CSS but incorrectly added `window.scrollY` and `window.scrollX` to the coordinates from `getBoundingClientRect()`. Fixed positioning is relative to the **viewport**, not the document — `getBoundingClientRect()` already returns viewport-relative values. Adding scroll offsets pushed the popover down by the scroll distance, causing it to go off-screen. Additionally, there was no logic to flip the popover above the trigger when there wasn't enough room below. **Fix:** Removed `scrollY`/`scrollX`, added flip-to-above logic that compares `spaceBelow` vs `spaceAbove` and uses CSS `bottom` positioning when flipped.

2. **Chat Submit button non-functional (third report)** — The `handleSubmit` was wrapped in `useCallback` with `[input, streaming, sectionContext, title]` dependencies and attached via `<form onSubmit={handleSubmit}>`. Inside a React Portal (rendered to `document.body`), the form element is outside the React root's DOM tree. While React's synthetic event system should handle portal events correctly, the `useCallback` reference was stale when the submit button was clicked — the callback captured an empty `input` from an earlier render cycle. **Fix:** Complete architectural change:
   - Replaced `useCallback` with a plain `async function doSend()`
   - Replaced `<form onSubmit>` with a plain `<div>` container
   - Added `inputValueRef = useRef()` that is synced on every `onChange` — `doSend()` reads from the ref instead of the state closure
   - Added `streamingRef = useRef()` similarly to prevent double-sends
   - Submit button uses explicit `onClick={() => doSend()}` instead of `type="submit"`
   - Input uses explicit `onKeyDown` Enter handler as a second trigger path
   - Belt-and-suspenders: two independent ways to trigger send, both reading from refs

3. **Chat showed "No auth token found" in console** — InfoPopover was reading `localStorage.getItem("token")`, but the app stores auth under `paloor_token` (and the current session token is also available via `useAuth()`). **Fix:** InfoPopover now reads from the auth context first and falls back to `localStorage.getItem("paloor_token")`, then uses that token in the `Authorization` header.

---

## Files Changed

| File                                      | Action          | Description                                        |
| ----------------------------------------- | --------------- | -------------------------------------------------- |
| `frontend/components/InfoPopover.tsx`     | Created + Fixed | Reusable info button + popover + ephemeral AI chat |
| `backend/chat/router.py`                  | Modified        | Added `POST /api/chat/ask` ephemeral endpoint      |
| `backend/chat/ai_service.py`              | Modified        | Added `stream_ai_response_ephemeral()`             |
| `frontend/app/dashboard/page.tsx`         | Modified        | InfoPopover on dashboard header + 4 cards          |
| `frontend/components/FinancialHealth.tsx` | Modified        | InfoPopover on Financial Health header             |
| `frontend/components/Sidebar.tsx`         | Reverted        | Removed sidebar info buttons (too tacky)           |
| `docs/SESSION_017.md`                     | Created         | This file                                          |

---

## Next Steps

- Create a Paloor data dictionary to feed the AI so it understands every element of the app
- Add InfoPopover to individual section pages (Assets detail, Equities charts, etc.)
- Consider adding contextual help to specific UI elements (buttons, forms, charts)

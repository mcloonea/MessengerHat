# AI Task Tracker

## MessengerHat: Console thread table

- **Stage:** Implemented
- **Status:** Needs review (user verification)
- **Plan:** references/plans/2026-04-01-messenger-crm-sheet-wireup.md
- **Notes:** Runs only on `https://www.messenger.com/marketplace*`, uses sheet `1HAOKyXof_UqWnkzg6ja_0QAxVkFUaGI8_LB66JJ-rGM`, and now targets tab `2026` because the Google Sheets API uses the tab title, not the spreadsheet file name.

## MessengerHat: Sheet tab lookup repair

- **Stage:** Implemented
- **Status:** Needs review (user verification)
- **Plan:** references/plans/2026-04-02-messenger-sheet-tab-fix.md
- **Notes:** Read/write ranges now quote the tab title for numeric sheet names, lookup failures surface the API error inline, and the stage dropdown is synced to the current CSV values.

## MessengerHat: CRM panel placement

- **Stage:** Implemented
- **Status:** Needs review (user verification)
- **Plan:** references/plans/2026-04-01-messenger-crm-panel-reposition.md
- **Notes:** Panel is inserted as the first child of `[aria-label^="Conversation titled"]`.

## MessengerHat: Runtime messaging guard

- **Stage:** Implemented
- **Status:** Needs review (user verification)
- **Plan:** references/plans/2026-04-01-messenger-runtime-guard.md
- **Notes:** `content.js` now guards extension messaging so reloaded or disconnected runtimes show an inline refresh message instead of throwing `sendMessage` errors.

## MessengerHat: Post-save sheet refresh consistency

- **Stage:** Implemented
- **Status:** Needs review (user verification)
- **Plan:** references/plans/2026-04-04-messenger-cache-invalidation.md
- **Notes:** `background.js` now clears the cached sheet snapshot after a successful row write so the next lookup reloads fresh values instead of reusing stale data for up to five minutes.

## MessengerHat: Stage dropdown options alignment

- **Stage:** Implemented
- **Status:** Needs review (user verification)
- **Plan:** references/plans/2026-04-04-messenger-stage-options-alignment.md
- **Notes:** `content.js` now restricts the Stage dropdown to the approved twelve options and preserves `Dead - Listing Removed` as the full stored value.

# AI Task Tracker

## MessengerHat: Console thread table

- **Stage:** Implemented
- **Status:** Needs review (user verification)
- **Plan:** references/plans/2026-04-01-messenger-crm-sheet-wireup.md
- **Notes:** Runs only on `https://www.messenger.com/marketplace*` and uses sheet `1HAOKyXof_UqWnkzg6ja_0QAxVkFUaGI8_LB66JJ-rGM` with OAuth client ID set.

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

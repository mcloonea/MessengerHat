# Plan: Messenger CRM sheet wireup

## Goal
Wire the extension to the provided Google Sheet and restrict it to Messenger Marketplace.

## Steps
1. Update manifest to only match `https://www.messenger.com/marketplace*` and set OAuth client ID.
2. Set the Google Sheet ID in `background.js`.
3. Set the Google Sheet URL in `content.js` fallback link.
4. Update AI task tracker with current status and assumptions.

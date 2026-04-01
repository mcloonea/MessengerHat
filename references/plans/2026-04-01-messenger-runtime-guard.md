# Plan: Guard extension runtime messaging in Messenger content script

## Goal
Prevent uncaught `sendMessage` errors when the Messenger tab is running a content script instance without a live extension runtime.

## Steps
1. Replace direct `chrome.runtime.sendMessage` calls in `content.js` with a guarded helper.
2. Show a clear inline error and status when runtime messaging is unavailable instead of throwing.
3. Avoid retrying row lookups when the extension runtime is disconnected.
4. Verify the edited files parse cleanly and update the AI task tracker with the new status.

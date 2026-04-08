# Plan: Messenger sheet cache invalidation

## Goal
Ensure the Messenger UI reloads fresh row data after a successful sheet update.

## Steps
1. Invalidate the background worker's cached sheet data after `UPDATE_ROW` completes successfully.
2. Leave the existing lookup and field rendering flow unchanged so the next lookup reads from Google Sheets.
3. Verify the edited file parses cleanly and update the AI task tracker with the implemented fix.

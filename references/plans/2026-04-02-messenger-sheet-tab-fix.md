# Plan: Messenger sheet tab fix

## Goal
Repair Google Sheets lookup/write access after the spreadsheet rename and current-sheet updates.

## Steps
1. Point the extension at the actual Google Sheets tab title used by the API.
2. Quote the A1 range so numeric tab names resolve correctly for reads and writes.
3. Surface lookup API failures as real errors instead of treating them as missing rows.
4. Sync the stage dropdown to the current sheet values used in the live data.
5. Update the AI task tracker with the implemented fix and current assumptions.

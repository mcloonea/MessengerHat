# Plan: Reposition CRM panel in Messenger thread view

## Goal
Move the injected CRM panel to be nested at the top of the thread container (as shown in the target UI).

## Steps
1. Change `injectPanel()` to insert the CRM panel as the first child of the resolved target container.
2. Preserve existing target selector fallbacks; adjust only insertion behavior.
3. Verify no layout regressions; add minimal CSS tweaks only if needed.
4. Update AI task tracker with status and plan reference.

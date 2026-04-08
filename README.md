# Messenger CRM

Chrome extension that overlays your Google Sheet CRM directly in Facebook Messenger.

---

## Setup — Do This Once

### 1. Google Cloud Project

1. Go to https://console.cloud.google.com
2. Create a new project (e.g. "Messenger CRM")
3. Enable **Google Sheets API** (APIs & Services → Library → search "Sheets")
4. Go to **APIs & Services → OAuth consent screen**
   - User type: External
   - App name: Messenger CRM
   - Add your Gmail as test user
5. Go to **APIs & Services → Credentials → Create Credentials → OAuth Client ID**
   - Application type: **Chrome Extension**
   - Copy your extension ID from `chrome://extensions` after loading it (step below)
   - Paste it as the "Application ID"
6. Copy the **Client ID** — it looks like `123456789.apps.googleusercontent.com`

### 2. Update the files

In `manifest.json`, replace:
```
"YOUR_CLIENT_ID_HERE.apps.googleusercontent.com"
```
with your actual client ID.

In `background.js`, replace:
```
const SHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';
```
with your spreadsheet ID. You can find it in the URL:
`https://docs.google.com/spreadsheets/d/THIS_PART_HERE/edit`

Also update `SHEET_NAME` so it matches your sheet tab title in Google Sheets, for example `2026`.

In `content.js`, replace:
```
https://docs.google.com/spreadsheets/d/YOUR_SPREADSHEET_ID_HERE/edit
```
with your actual sheet URL (used for the "Open Sheet" fallback link).

### 3. Load the extension

1. Open Chrome → `chrome://extensions`
2. Enable **Developer Mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `messenger-crm` folder
5. Copy the Extension ID shown — go back to Google Cloud and add it to your OAuth client

### 4. Start the backend

```bash
pip install flask flask-cors
python app.py
```

---

## How it works

**When you open a conversation in Messenger:**
- Extension reads the thread name (e.g. "Kim · 2024 Volkswagen Atlas")
- Splits it into Customer name + Vehicle name
- Looks up your Google Sheet by matching both columns exactly
- Injects a panel above the message thread showing all columns
- Every editable field writes back to the sheet on Save

**Matching logic:**
- Column F (Customer) must match the first part of the Messenger name
- Column H (Vehicle) must match the rest
- If no match: shows "No match found" with a link to open the sheet manually

**Inbound detection:**
- Watches the thread list for conversations that flip from `sentByYou: true` to `sentByYou: false`
- POSTs to `localhost:5000/inbound` when detected
- Backend logs it and prints to terminal

---

## Column mapping

| Sheet Column | Field | Editable |
|---|---|---|
| A | Handler | No |
| B | Last Contact | Yes (auto-updates on save) |
| C | Notes | Yes |
| D | Stage | Yes (dropdown) |
| E | Source | No |
| F | Customer | No (used for matching) |
| G | Mileage | Yes |
| H | Vehicle | No (used for matching) |
| I | VIN | Yes |
| J | Condition | Yes |
| K | Their Ask | Yes |
| L | Counter | Yes |
| M | Andrew # | Yes |
| N | Kevin's # | Yes |
| O | MMR | Yes |

---

## Troubleshooting

**Panel doesn't appear:**
- Check `chrome://extensions` for errors
- Open devtools on Messenger → Console tab
- Should see `[CRM] Messenger CRM loaded`

**"No match found" when you expect a match:**
- Check exact spelling in the sheet vs Messenger name
- Names are case-insensitive but spaces matter
- Open the sheet and fix column F or H to match exactly

**Auth errors:**
- Click the extension icon in Chrome toolbar
- It will trigger the OAuth flow
- Make sure your Gmail is added as a test user in Google Cloud Console

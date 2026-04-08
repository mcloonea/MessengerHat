// ✓ Checkpoint: Last working version before chrome sidepanel implementation
// background.js - Handles Google Sheets API access

const SHEET_ID = '1HAOKyXof_UqWnkzg6ja_0QAxVkFUaGI8_LB66JJ-rGM';
// Google Sheets API ranges use the tab title, not the spreadsheet file name.
const SHEET_NAME = '2026';
const API_KEY = 'AIzaSyBwKqCp1ZDl8uIJlpz_VrWzZRPK1fJ8b08';

// Service account credentials for writing
const SERVICE_ACCOUNT = {
  "type": "service_account",
  "project_id": "appraisal-filter-extension",
  "private_key_id": "14c83d7587f5c93f93f030a4e9233041608838dc",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDNoCCVgBehVjIj\nZB+OxiJMJ9XQRfs3Acc3Xzh/4shsAYN5tANPTIiy8YYpqS1q9S4K2gaQkDF4zCkp\n+C1Kaw7z9lH37xiV3xxqvqDgdrTe7R8+8EgP4uy9Hn1AL11/RmzCvLWMqDT+cWs5\nLsogJoOYmGYo8/JbBsE0M9pbHUJlL2yQkhd5psdIWOwuJBn1dFgu6Vu/wdZUMyIP\nCOalGro23ren2+NErhxh4Z1Ak9ku7HnntmrhlwPsfu3HPC2f6Be021Yw19moqXkp\nb8p9f5RXmP9TDajPmkJU9GVOv9JS6jzPLcjXohxkbr1etT/8iPVdsxxlxK2kj7uf\nDWDpijAtAgMBAAECggEAMAuXMXdhjhgG1RAi84hGIUc5hVWksiCfPMfp+q+xptLf\ntoMiNtgqJK2cbIWUECbDoFN7LzIR7Si/AYh0hKvpLYXDd0wNkY81I5fxHSF/d4su\nPtWD8PpT2IiUOXgXv5Jj/Uh8nyX6Y+16YT0Wi1aUbwZE8JK3cR9t61WmUp3OkreL\ntoZ+m8g5NoGDNH9g+y21Yy32oZCdczLzmGVzUntli4GY/qiLhDhHxbeFtz5PSNfa\ntwYQvDqR1lWG7WIvX3DO76SVKq7Vtk4ZlH5+gpYyDClxCS6hlClS6M7EYbU28rR/\nkN630xhpvF0dv0eZlrguqImGa0cS6bcScL/cQKP6/QKBgQDvBYypzOlFLGeF2mqw\nJKz78P1yBaRq+dlyyH95rMYVcHufmn3+a2c2cXQDmmYdR7arMl8H7bKEftFz2c1l\n8uRJ9PVU0otfv1WLDFcUq/SOacF2ClJTmWL6NOrEcYh+Ex+LHnBMUGrGKqaX93kQ\nP56ptOKdw98yubnNaKKtvKNDewKBgQDcO0paj8mtzB61uEWvQIaelH9M6/ad9fyN\nmZteXBt331xy16j8yucsDcNSax05hLCS5N+w4uKspti0Ri+OqFj5hqooolLSh7/D\nEnIvFpezjexya6CfLMWh/3oJLOZnZHaVC+5f3DjpPveBfsBTisyMWGpVMTXFzMtD\nDvl0DqfWdwKBgQCZ8uYVm8CHaEFJSlO7HfQ41ZA4N4Ad0s0GjDLmyKxQtME7HEOY\ncc7plwtVIsYwh7cU7v2cWrHHevMm/hq4VkhJhjfZqT5RrifHxmv0CYkbjOwpPh6m\nb737T8gCPOnf4itH7JQB4y3SczgX2zIjkAZ+Yd4wJS+GOW996K4W3s/9LwKBgAtX\nZlHZm8o+e8ph7fzDdutNvGyKrk2eMF5ebbjjR2rZ7tnfL02taVBEeS2SZJPkuG8o\nKDjkxkWb5gcKokJXexWGkNa83UUIRqDWH1k7cZ6GjYmq7z+jP55DGNbGICts6gps\n7d6z6Z5hZr+ddmwW9se3eepfOWSxUjpm2APZCV2rAoGAJA6AyzJzvag4a1Tw/vq1\nTbCEf4iDVEh0qlVVo40ZE/IW+aDW/GejeskGTfCOhYyH9bkG8i+1ll7jwKFFmn7O\nOmFrAuA630NeNKOG8DnswIzMzcpUrN3Psp4ifXhunYFIcTvv7RoXTXqMdF7Ym09O\nFyQD4YmzpAQ5cp7tVL4valU=\n-----END PRIVATE KEY-----\n",
  "client_email": "messengerhatserviceaccount@appraisal-filter-extension.iam.gserviceaccount.com",
  "client_id": "104436900199452614941",
  "token_uri": "https://oauth2.googleapis.com/token"
};

let cachedAccessToken = null;
let tokenExpiresAt = 0;
let cachedSheetData = null;
let sheetDataExpiresAt = 0;

function invalidateSheetCache() {
  cachedSheetData = null;
  sheetDataExpiresAt = 0;
}

function getSheetRange(cells) {
  const escapedSheetName = SHEET_NAME.replace(/'/g, "''");
  return `'${escapedSheetName}'!${cells}`;
}

// Find row by Customer (col F) and Vehicle (col H)
async function findRow(customerName, vehicleName) {
  let rows = [];
  try {
    console.log('[CRM] findRow called with:', { customerName, vehicleName });

    // Check if we have cached sheet data that's still valid (5 min cache)
    if (cachedSheetData && Date.now() < sheetDataExpiresAt) {
      console.log('[CRM] Using cached sheet data');
      rows = cachedSheetData;
    } else {
      const range = getSheetRange('A:O');
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?key=${API_KEY}`;
      console.log('[CRM] Fetching fresh data from:', url.substring(0, 80) + '...');

      const res = await fetch(url);
      console.log('[CRM] Fetch response status:', res.status);
      const data = await res.json();

      if (!res.ok) {
        const message = data?.error?.message || `Sheet API request failed with status ${res.status}`;
        console.error('[CRM] Sheet API error:', { status: res.status, range, message, details: data });
        throw new Error(message);
      }
      rows = data.values || [];
      cachedSheetData = rows;
      sheetDataExpiresAt = Date.now() + (5 * 60 * 1000); // Cache for 5 minutes
      console.log('[CRM] Found', rows.length, 'rows in sheet, cached for 5 minutes');
    }
  } catch (err) {
    console.error('[CRM] findRow error:', err);
    throw err;
  }

  // Skip header row and date rows (rows where col A looks like a date)
  const matches = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const customer = (row[5] || '').trim().toLowerCase();
    const vehicle = (row[7] || '').trim().toLowerCase();

    const nameMatch = customerName.trim().toLowerCase();
    const vehicleMatch = vehicleName.trim().toLowerCase();

    // Check if customer name is contained in sheet value (handles first/last name)
    const customerMatches = customer.includes(nameMatch);

    // Check if vehicle is contained in sheet value (handles partial matches)
    const vehicleMatches = vehicleMatch === '' || vehicle.includes(vehicleMatch);

    if (i < 5) {
      console.log(`[CRM] Row ${i}: customer="${customer}" contains "${nameMatch}"? ${customerMatches}, vehicle="${vehicle}" contains "${vehicleMatch}"? ${vehicleMatches}`);
    }

    // Match: customer name AND vehicle
    if (customerMatches && vehicleMatches) {
      matches.push({ rowIndex: i + 1, rowData: row });
    }
  }

  if (matches.length > 1) {
    console.error(`[CRM] ERROR: Found ${matches.length} matching rows. Matches at rows: ${matches.map(m => m.rowIndex).join(', ')}`);
    return { error: `Found ${matches.length} matching rows. Cannot determine which lead. Check rows: ${matches.map(m => m.rowIndex).join(', ')}` };
  }

  if (matches.length === 1) {
    console.log(`[CRM] MATCH found at row ${matches[0].rowIndex}`);
    return { rowIndex: matches[0].rowIndex, rowData: matches[0].rowData };
  }

  console.log('[CRM] No matching row found');
  return null;
}

// Helper: base64url encode
function base64url(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Helper: convert PEM to ArrayBuffer
function pemToArrayBuffer(pem) {
  const b64 = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\n/g, '');
  const binaryString = atob(b64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Create and sign JWT for service account
async function createJWT() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: SERVICE_ACCOUNT.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: SERVICE_ACCOUNT.token_uri,
    exp: now + 3600,
    iat: now
  };

  const headerEncoded = base64url(JSON.stringify(header));
  const payloadEncoded = base64url(JSON.stringify(payload));
  const message = `${headerEncoded}.${payloadEncoded}`;

  try {
    // Import the private key
    const keyBuffer = pemToArrayBuffer(SERVICE_ACCOUNT.private_key);
    const key = await crypto.subtle.importKey(
      'pkcs8',
      keyBuffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );

    // Sign the JWT
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      key,
      new TextEncoder().encode(message)
    );

    const signatureEncoded = base64url(String.fromCharCode(...new Uint8Array(signature)));
    return `${message}.${signatureEncoded}`;
  } catch (err) {
    console.error('[CRM] JWT creation failed:', err);
    throw err;
  }
}

// Get access token from Google
async function getAccessToken() {
  // Return cached token if still valid
  if (cachedAccessToken && Date.now() < tokenExpiresAt) {
    return cachedAccessToken;
  }

  try {
    const jwt = await createJWT();
    const res = await fetch(SERVICE_ACCOUNT.token_uri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
    });

    if (!res.ok) {
      const err = await res.json();
      console.error('[CRM] Token exchange failed:', err);
      throw new Error('Failed to get access token');
    }

    const data = await res.json();
    cachedAccessToken = data.access_token;
    tokenExpiresAt = Date.now() + (data.expires_in * 1000);
    console.log('[CRM] Got access token, expires in', data.expires_in, 'seconds');
    return cachedAccessToken;
  } catch (err) {
    console.error('[CRM] getAccessToken error:', err);
    throw err;
  }
}

// Update specific columns in a row
async function updateRow(rowIndex, updates) {
  try {
    console.log('[CRM] updateRow called with:', { rowIndex, updates });
    const token = await getAccessToken();

    // Update each column individually to avoid any mapping issues
    for (const col in updates) {
      const value = updates[col];
      const range = getSheetRange(`${col}${rowIndex}`);
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?valueInputOption=RAW`;

      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ values: [[value]] })
      });

      if (!res.ok) {
        const err = await res.json();
        console.error(`[CRM] Failed to update ${col}${rowIndex}:`, err);
        throw new Error(`Failed to update ${col}: ${err.error?.message || 'Unknown error'}`);
      }

      console.log(`[CRM] Updated ${col}${rowIndex}`);
    }

    invalidateSheetCache();
    console.log('[CRM] Cleared cached sheet data after write');
    console.log('[CRM] Row updated successfully');
    return { success: true };
  } catch (err) {
    console.error('[CRM] updateRow error:', err);
    throw err;
  }
}

// Message handler from content script and side panel
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'THREAD_CHANGED') {
    console.log('[CRM] THREAD_CHANGED from content script:', msg);
    // Open side panel for this window
    if (sender.tab?.windowId) {
      chrome.sidePanel.open({ windowId: sender.tab.windowId }, () => {
        // Forward the message to the side panel
        chrome.runtime.sendMessage(
          { type: 'THREAD_CHANGED', ...msg },
          (response) => {
            if (chrome.runtime?.lastError) {
              console.error('[CRM] Failed to forward to side panel:', chrome.runtime.lastError);
            }
          }
        );
      });
    }
    return true;
  }

  if (msg.type === 'FIND_ROW') {
    findRow(msg.customerName, msg.vehicleName)
      .then(result => sendResponse({ success: true, result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // async
  }

  if (msg.type === 'UPDATE_ROW') {
    updateRow(msg.rowIndex, msg.updates)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // async
  }

});

// background.js - Handles Google Sheets API access

const SHEET_ID = '1HAOKyXof_UqWnkzg6ja_0QAxVkFUaGI8_LB66JJ-rGM';
const SHEET_NAME = 'Sheet1';
const API_KEY = 'AIzaSyBwKqCp1ZDl8uIJlpz_VrWzZRPK1fJ8b08';

// Find row by Customer (col F) and Vehicle (col H)
async function findRow(customerName, vehicleName) {
  try {
    console.log('[CRM] findRow called with:', { customerName, vehicleName });
    const range = `${SHEET_NAME}!A:O`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?key=${API_KEY}`;
    console.log('[CRM] Fetching from:', url.substring(0, 80) + '...');

    const res = await fetch(url);
    console.log('[CRM] Fetch response status:', res.status);
    const data = await res.json();

    if (!res.ok) {
      console.error('[CRM] Sheet API error:', data);
      return null;
    }
    const rows = data.values || [];
    console.log('[CRM] Found', rows.length, 'rows in sheet');
  } catch (err) {
    console.error('[CRM] findRow error:', err);
    throw err;
  }

  // Skip header row and date rows (rows where col A looks like a date)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const customer = (row[5] || '').trim().toLowerCase();
    const vehicle = (row[7] || '').trim().toLowerCase();

    const nameMatch = customerName.trim().toLowerCase();
    const vehicleMatch = vehicleName.trim().toLowerCase();

    // Check if customer name matches (exact or first name only)
    const customerMatches = customer === nameMatch || customer.startsWith(nameMatch + ' ');

    if (i < 5) {
      console.log(`[CRM] Row ${i}: customer="${customer}" vs "${nameMatch}", vehicle="${vehicle}" vs "${vehicleMatch}"`);
    }

    // Dual match: customer name AND vehicle
    if (customerMatches && vehicle === vehicleMatch) {
      console.log(`[CRM] MATCH found at row ${i + 1}`);
      return { rowIndex: i + 1, rowData: row }; // +1 because sheets is 1-indexed
    }

    // Fallback: just customer name if vehicle is empty or partial
    if (customerMatches && vehicleMatch === '') {
      console.log(`[CRM] MATCH (name only) found at row ${i + 1}`);
      return { rowIndex: i + 1, rowData: row };
    }
  }
  console.log('[CRM] No matching row found');
  return null;
}

// Update specific columns in a row
async function updateRow(rowIndex, updates) {
  console.error('[CRM] updateRow called but API keys cannot write. Need OAuth or service account key.');
  throw new Error('Writing to sheets requires OAuth or service account authentication');
}

// Message handler from content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
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

// background.js - Handles Google Sheets API access

const SHEET_ID = '1HAOKyXof_UqWnkzg6ja_0QAxVkFUaGI8_LB66JJ-rGM';
const SHEET_NAME = 'Sheet1';
const API_KEY = 'AIzaSyBwKqCp1ZDl8uIJlpz_VrWzZRPK1fJ8b08';

// Find row by Customer (col F) and Vehicle (col H)
async function findRow(customerName, vehicleName) {
  console.log('[CRM] findRow called with:', { customerName, vehicleName });
  const range = `${SHEET_NAME}!A:O`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?key=${API_KEY}`;

  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) {
    console.error('[CRM] Sheet API error:', data);
    return null;
  }
  const rows = data.values || [];
  console.log('[CRM] Found', rows.length, 'rows in sheet');

  // Skip header row and date rows (rows where col A looks like a date)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const customer = (row[5] || '').trim().toLowerCase();
    const vehicle = (row[7] || '').trim().toLowerCase();

    const nameMatch = customerName.trim().toLowerCase();
    const vehicleMatch = vehicleName.trim().toLowerCase();

    // Check if customer name matches (exact or first name only)
    const customerMatches = customer === nameMatch || customer.startsWith(nameMatch + ' ');

    // Dual match: customer name AND vehicle
    if (customerMatches && vehicle === vehicleMatch) {
      return { rowIndex: i + 1, rowData: row }; // +1 because sheets is 1-indexed
    }

    // Fallback: just customer name if vehicle is empty or partial
    if (customerMatches && vehicleMatch === '') {
      return { rowIndex: i + 1, rowData: row };
    }
  }
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

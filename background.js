// background.js - Handles Google OAuth token management

const SHEET_ID = '1HAOKyXof_UqWnkzg6ja_0QAxVkFUaGI8_LB66JJ-rGM';
const SHEET_NAME = 'Sheet1';

// Get OAuth token
async function getToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(token);
      }
    });
  });
}

// Find row by Customer (col F) and Vehicle (col H)
async function findRow(customerName, vehicleName) {
  const token = await getToken();
  const range = `${SHEET_NAME}!A:O`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  const rows = data.values || [];

  // Skip header row and date rows (rows where col A looks like a date)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const customer = (row[5] || '').trim().toLowerCase();
    const vehicle = (row[7] || '').trim().toLowerCase();

    const nameMatch = customerName.trim().toLowerCase();
    const vehicleMatch = vehicleName.trim().toLowerCase();

    // Dual match: customer name AND vehicle
    if (customer === nameMatch && vehicle === vehicleMatch) {
      return { rowIndex: i + 1, rowData: row }; // +1 because sheets is 1-indexed
    }

    // Fallback: just customer name if vehicle is empty or partial
    if (customer === nameMatch && vehicleMatch === '') {
      return { rowIndex: i + 1, rowData: row };
    }
  }
  return null;
}

// Update specific columns in a row
async function updateRow(rowIndex, updates) {
  // updates = { B: 'value', C: 'value', D: 'value', ... }
  const token = await getToken();
  
  const colMap = { A:0, B:1, C:2, D:3, E:4, F:5, G:6, H:7, I:8, J:9, K:10, L:11, M:12, N:13, O:14 };
  
  const requests = Object.entries(updates).map(([col, value]) => {
    const colLetter = col;
    const range = `${SHEET_NAME}!${colLetter}${rowIndex}`;
    return fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ values: [[value]] })
      }
    );
  });

  await Promise.all(requests);
  return true;
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

  if (msg.type === 'GET_TOKEN') {
    getToken()
      .then(token => sendResponse({ success: true, token }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

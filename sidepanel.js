// sidepanel.js - Side panel UI and logic

console.log('Messenger CRM side panel loaded');

// ── State ─────────────────────────────────────────────────────────────────────
let currentThreadId = null;
let currentRowIndex = null;
let pendingChanges = {};
let autoSaveTimer = null;

// ── Column definitions (matches your sheet exactly) ───────────────────────────
const COLUMNS = [
  { key: 'handler',   col: 'A', label: 'Handler',    editable: false },
  { key: 'last',      col: 'B', label: 'Last',        editable: true, type: 'text' },
  { key: 'notes',     col: 'C', label: 'Notes',       editable: true, type: 'textarea' },
  { key: 'stage',     col: 'D', label: 'Stage',       editable: true, type: 'select',
    options: ['Collecting Info', 'Require Review', 'Require Kevin Review', 'Reviewed', 'Working', 'Hot', 'Purchased', 'Dead - History', 'Dead - Sold', 'Dead - Other', 'Cold', 'Dead - Listing Removed'] },
  { key: 'source',    col: 'E', label: 'Source',      editable: false },
  { key: 'customer',  col: 'F', label: 'Customer',    editable: false },
  { key: 'mileage',   col: 'G', label: 'Mileage',     editable: true, type: 'text' },
  { key: 'vehicle',   col: 'H', label: 'Vehicle',     editable: false },
  { key: 'vin',       col: 'I', label: 'VIN',         editable: true, type: 'text' },
  { key: 'condition', col: 'J', label: 'Condition',   editable: true, type: 'text' },
  { key: 'initial',   col: 'K', label: 'Initial',     editable: true, type: 'text' },
  { key: 'counter',   col: 'L', label: 'Counter',     editable: true, type: 'text' },
  { key: 'andrew',    col: 'M', label: 'Andrew #',    editable: true, type: 'text' },
  { key: 'kevin',     col: 'N', label: "Kevin's #",   editable: true, type: 'text' },
  { key: 'mmr',       col: 'O', label: 'MMR',         editable: true, type: 'text' },
];

function sendBackgroundMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      const runtimeError = chrome.runtime?.lastError;
      if (runtimeError) {
        console.error('[MessengerHat] Message failed:', message.type, runtimeError.message);
        resolve({ success: false, error: runtimeError.message, unavailable: true });
        return;
      }
      resolve(response || { success: false, error: 'Empty response from background' });
    });
  });
}

// ── Render fields with row data ───────────────────────────────────────────────
function renderFields(rowData) {
  const fieldsEl = document.getElementById('crm-fields');
  if (!fieldsEl) return;

  fieldsEl.innerHTML = '';
  fieldsEl.style.display = 'flex';
  fieldsEl.style.flexDirection = 'column';
  fieldsEl.style.gap = '0';
  pendingChanges = {};

  // Section definitions
  const stageFields = ['last', 'stage'];
  const vehicleFields = ['mileage', 'vin'];
  const pricingFields = ['initial', 'counter', 'andrew', 'kevin', 'mmr'];
  const notesFields = ['condition', 'notes'];

  // Helper function to add section header
  const addSectionHeader = (name) => {
    const sectionHeader = document.createElement('div');
    sectionHeader.style.cssText = `
      padding: 12px 0 8px 0;
      font-size: 14px;
      font-weight: 600;
      color: #1a1a1a;
      margin-top: 0;
    `;
    sectionHeader.textContent = name;
    fieldsEl.appendChild(sectionHeader);
  };

  // Render ALL columns EXCEPT vehicle, source, handler, customer, condition, notes
  COLUMNS.forEach((col, idx) => {
    // Skip: vehicle (top bar), source (not needed), handler (shown as customer name), customer (shown at top), condition/notes (separate section)
    if (col.key === 'vehicle' || col.key === 'source' || col.key === 'handler' || col.key === 'customer' || notesFields.includes(col.key)) return;

    // Add section headers
    if (stageFields.includes(col.key) && (idx === 0 || !stageFields.includes(COLUMNS[idx - 1]?.key))) {
      addSectionHeader('Stage');
    } else if (vehicleFields.includes(col.key) && (idx === 0 || !vehicleFields.includes(COLUMNS[idx - 1]?.key))) {
      addSectionHeader('Vehicle');
    } else if (pricingFields.includes(col.key) && (idx === 0 || !pricingFields.includes(COLUMNS[idx - 1]?.key))) {
      addSectionHeader('Pricing');
    }

    const colIndex = COLUMNS.indexOf(col);
    const value = (rowData[colIndex] || '').toString().trim();

    const fieldRow = document.createElement('div');
    fieldRow.className = 'crm-field-row';

    const label = document.createElement('div');
    label.className = 'crm-field-label';
    label.textContent = col.label;

    const inputWrapper = document.createElement('div');
    inputWrapper.className = 'crm-field-input-wrapper';

    let input;

    if (!col.editable) {
      input = document.createElement('span');
      input.className = 'crm-value-static';
      input.textContent = value || '—';
    } else if (col.type === 'select') {
      input = document.createElement('select');
      input.className = 'crm-input crm-select';
      col.options.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt;
        if (opt === value) o.selected = true;
        input.appendChild(o);
      });
      if (value && !col.options.includes(value)) {
        const o = document.createElement('option');
        o.value = value;
        o.textContent = value;
        o.selected = true;
        input.insertBefore(o, input.firstChild);
      }
      input.addEventListener('change', () => {
        pendingChanges[col.col] = input.value;
        triggerAutoSave();
        updateSaveButtonState();
      });
    } else if (col.type === 'textarea') {
      input = document.createElement('textarea');
      input.className = 'crm-input crm-textarea';
      input.value = value;
      const adjustHeight = () => {
        input.style.height = 'auto';
        const newHeight = Math.max(input.scrollHeight, 80);
        input.style.height = newHeight + 'px';
      };
      input.addEventListener('input', () => {
        pendingChanges[col.col] = input.value;
        adjustHeight();
        triggerAutoSave();
        updateSaveButtonState();
      });
      setTimeout(adjustHeight, 0);
    } else {
      input = document.createElement('input');
      input.type = 'text';
      input.className = 'crm-input';
      input.value = value;
      input.addEventListener('input', () => {
        pendingChanges[col.col] = input.value;
        triggerAutoSave();
        updateSaveButtonState();
      });
    }

    inputWrapper.appendChild(input);
    fieldRow.appendChild(label);
    fieldRow.appendChild(inputWrapper);
    fieldsEl.appendChild(fieldRow);
  });

  // Notes section with Condition and Notes side by side
  const conditionCol = COLUMNS.find(c => c.key === 'condition');
  const notesCol = COLUMNS.find(c => c.key === 'notes');

  if (conditionCol || notesCol) {
    // Add Notes section header
    const notesHeader = document.createElement('div');
    notesHeader.style.cssText = `
      padding: 12px 0 8px 0;
      font-size: 14px;
      font-weight: 600;
      color: #1a1a1a;
      margin-top: 0;
    `;
    notesHeader.textContent = 'Notes';
    fieldsEl.appendChild(notesHeader);

    // Create vertical container for Condition and Notes
    const notesContainer = document.createElement('div');
    notesContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 4px;
    `;

    // Condition field (top, textarea with auto-expand)
    if (conditionCol) {
      const conditionIdx = COLUMNS.indexOf(conditionCol);
      const conditionValue = (rowData[conditionIdx] || '').toString().trim();

      const conditionWrapper = document.createElement('div');
      conditionWrapper.style.cssText = ``;

      const condLabel = document.createElement('div');
      condLabel.className = 'crm-field-label';
      condLabel.textContent = 'Condition';

      const condInput = document.createElement('textarea');
      condInput.className = 'crm-input crm-textarea';
      condInput.value = conditionValue;
      condInput.style.minHeight = '28px';
      const adjustCondHeight = () => {
        condInput.style.height = 'auto';
        const newHeight = Math.max(condInput.scrollHeight, 28);
        condInput.style.height = newHeight + 'px';
      };
      condInput.addEventListener('input', () => {
        pendingChanges['J'] = condInput.value;
        adjustCondHeight();
        triggerAutoSave();
        updateSaveButtonState();
      });
      setTimeout(adjustCondHeight, 0);

      conditionWrapper.appendChild(condLabel);
      conditionWrapper.appendChild(condInput);
      notesContainer.appendChild(conditionWrapper);
    }

    // Notes field (bottom, textarea)
    if (notesCol) {
      const notesIdx = COLUMNS.indexOf(notesCol);
      const notesValue = (rowData[notesIdx] || '').toString().trim();

      const notesWrapper = document.createElement('div');
      notesWrapper.style.cssText = ``;

      const notesLabel = document.createElement('div');
      notesLabel.className = 'crm-field-label';
      notesLabel.textContent = 'Notes';

      const notesInput = document.createElement('textarea');
      notesInput.className = 'crm-input crm-textarea';
      notesInput.value = notesValue;
      notesInput.style.minHeight = '60px';
      const adjustHeight = () => {
        notesInput.style.height = 'auto';
        const newHeight = Math.max(notesInput.scrollHeight, 60);
        notesInput.style.height = newHeight + 'px';
      };
      notesInput.addEventListener('input', () => {
        pendingChanges['C'] = notesInput.value;
        adjustHeight();
        triggerAutoSave();
        updateSaveButtonState();
      });
      setTimeout(adjustHeight, 0);

      notesWrapper.appendChild(notesLabel);
      notesWrapper.appendChild(notesInput);
      notesContainer.appendChild(notesWrapper);
    }

    fieldsEl.appendChild(notesContainer);
  }

  // Save button handler
  const saveBtn = document.getElementById('crm-save-btn-header');
  if (saveBtn) {
    saveBtn.onclick = () => {
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
      performSave();
    };
  }
}

function updateSaveButtonState() {
  const saveBtn = document.getElementById('crm-save-btn-header');
  if (!saveBtn) return;

  const hasPendingChanges = Object.keys(pendingChanges || {}).length > 0;

  if (hasPendingChanges) {
    saveBtn.disabled = false;
    saveBtn.style.backgroundColor = '';
    saveBtn.style.opacity = '1';
  } else {
    saveBtn.disabled = true;
    saveBtn.style.backgroundColor = '#999';
    saveBtn.style.opacity = '0.6';
  }
}

function triggerAutoSave() {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);

  showSaveBar();
  const saveBtn = document.getElementById('crm-save-btn-header');
  if (saveBtn) {
    saveBtn.textContent = 'Saving...';
    saveBtn.style.backgroundColor = '#666';
  }

  autoSaveTimer = setTimeout(() => {
    performSave();
  }, 300);
}

function performSave() {
  const saveBtn = document.getElementById('crm-save-btn-header');
  if (!saveBtn || !currentRowIndex || Object.keys(pendingChanges).length === 0) return;

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';
  saveBtn.style.backgroundColor = '#666';

  const today = new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
  pendingChanges['B'] = pendingChanges['B'] || today;

  sendBackgroundMessage({ type: 'UPDATE_ROW', rowIndex: currentRowIndex, updates: pendingChanges })
    .then((res) => {
      const status = document.getElementById('crm-save-status-header');
      if (res?.success) {
        saveBtn.textContent = 'Saved ✓';
        saveBtn.style.backgroundColor = '#28a745';
        if (status) status.textContent = '';
        Object.keys(pendingChanges).forEach(k => delete pendingChanges[k]);
        setTimeout(() => {
          saveBtn.textContent = 'Save';
          saveBtn.style.backgroundColor = '';
          hideSaveBar();
        }, 2000);
      } else {
        saveBtn.textContent = 'Error ✗';
        saveBtn.style.backgroundColor = '#dc3545';
        if (status) status.textContent = res?.error || 'Save failed';
      }
    });
}

function showSaveBar() {
  const bar = document.getElementById('crm-save-header');
  if (bar) bar.style.display = 'flex';
}

function hideSaveBar() {
  const bar = document.getElementById('crm-save-header');
  if (bar) bar.style.display = 'none';
}

function setStatus(text) {
  const el = document.getElementById('crm-status');
  if (el) el.textContent = text;
}

function showFields(rowData) {
  const loading = document.getElementById('crm-loading');
  const fields = document.getElementById('crm-fields');
  const noMatch = document.getElementById('crm-no-match');
  const errorInline = document.getElementById('crm-error-inline');
  if (loading) loading.style.display = 'none';
  if (noMatch) noMatch.style.display = 'none';
  if (errorInline) errorInline.style.display = 'none';
  if (fields) {
    fields.style.display = 'grid';
    renderFields(rowData);
    updateSaveButtonState();
  }
}

function showNoMatch() {
  const loading = document.getElementById('crm-loading');
  const fields = document.getElementById('crm-fields');
  const noMatch = document.getElementById('crm-no-match');
  const errorInline = document.getElementById('crm-error-inline');
  if (loading) loading.style.display = 'none';
  if (fields) fields.style.display = 'none';
  if (errorInline) errorInline.style.display = 'none';
  if (noMatch) noMatch.style.display = 'flex';
}

function showError(message = 'error: multiple matches') {
  const loading = document.getElementById('crm-loading');
  const fields = document.getElementById('crm-fields');
  const noMatch = document.getElementById('crm-no-match');
  const errorInline = document.getElementById('crm-error-inline');
  if (loading) loading.style.display = 'none';
  if (fields) fields.style.display = 'none';
  if (noMatch) noMatch.style.display = 'none';
  if (errorInline) {
    errorInline.textContent = message;
    errorInline.style.display = 'inline';
  }
}

function showLoading() {
  const loading = document.getElementById('crm-loading');
  const fields = document.getElementById('crm-fields');
  const noMatch = document.getElementById('crm-no-match');
  const errorInline = document.getElementById('crm-error-inline');
  if (loading) loading.style.display = 'block';
  if (fields) fields.style.display = 'none';
  if (noMatch) noMatch.style.display = 'none';
  if (errorInline) errorInline.style.display = 'none';
}

// ── Handle THREAD_CHANGED message from content.js ──────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'THREAD_CHANGED') {
    console.log('[MessengerHat] THREAD_CHANGED:', msg);
    lookupThread(msg);
  }
});

function lookupThread(threadMsg) {
  currentThreadId = threadMsg.threadId;
  currentRowIndex = null;
  showLoading();

  const { customer, vehicle } = threadMsg;
  setStatus(`Looking up: ${customer}`);

  sendBackgroundMessage({ type: 'FIND_ROW', customerName: customer, vehicleName: vehicle })
    .then((res) => {
      if (res?.success && res.result) {
        if (res.result.error) {
          setStatus('Multiple matches');
          showError(res.result.error);
        } else {
          currentRowIndex = res.result.rowIndex;
          const rowData = res.result.rowData;
          while (rowData.length < 15) rowData.push('');

          // Get full customer name from sheet (column F = index 5)
          const fullCustomerName = (rowData[5] || '').toString().trim();
          // Get full vehicle name from sheet (column H = index 7)
          const fullVehicleName = (rowData[7] || '').toString().trim();

          // Populate top bar (2 rows) with full names from sheet
          document.getElementById('crm-customer').textContent = fullCustomerName || '—';
          document.getElementById('crm-customer').title = fullCustomerName;
          document.getElementById('crm-vehicle').textContent = fullVehicleName || '—';
          document.getElementById('crm-vehicle').title = fullVehicleName;
          document.getElementById('crm-row-number').textContent = `Row ${currentRowIndex}`;

          setStatus('');
          showFields(rowData);
        }
        return;
      }

      if (res?.error) {
        setStatus('Lookup failed');
        showError(res.error);
        return;
      }

      showNoMatch();
    });
}

// On panel load, announce to background and request thread context
console.log('[MessengerHat] Side panel initializing');

// Tell background the side panel is open
chrome.runtime.sendMessage({ type: 'PANEL_READY' }, (response) => {
  if (chrome.runtime?.lastError) {
    console.error('[MessengerHat] Could not notify background:', chrome.runtime.lastError.message);
  }
});

// Request current thread context if one exists
sendBackgroundMessage({ type: 'GET_THREAD_CONTEXT' })
  .then((res) => {
    if (res?.threadContext) {
      console.log('[MessengerHat] Got thread context from background:', res.threadContext);
      lookupThread(res.threadContext);
    } else {
      console.log('[MessengerHat] No thread context yet, waiting...');
      setStatus('Open a Messenger conversation to get started');
    }
  });

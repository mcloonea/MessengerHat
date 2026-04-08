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
  fieldsEl.style.gap = '8px';
  pendingChanges = {};

  // Fields to exclude: Handler (A), Source (E), Customer (F), Vehicle (H)
  const excludeKeys = ['handler', 'source', 'customer', 'vehicle'];
  const displayCols = COLUMNS.filter(col => !excludeKeys.includes(col.key));

  // Separate notes from other fields
  const noteCol = displayCols.find(col => col.key === 'notes');
  const mainCols = displayCols.filter(col => col.key !== 'notes');

  // Render main fields in a flexible row
  const mainRow = document.createElement('div');
  mainRow.style.display = 'flex';
  mainRow.style.flexWrap = 'nowrap';
  mainRow.style.gap = '4px';

  mainCols.forEach((col, i) => {
    const colIndex = COLUMNS.indexOf(col);
    const value = (rowData[colIndex] || '').toString().trim();

    const fieldWrapper = document.createElement('div');
    fieldWrapper.style.display = 'flex';
    fieldWrapper.style.flexDirection = 'column';
    fieldWrapper.style.gap = '2px';
    fieldWrapper.style.minWidth = '0';
    // Proportional flex: Stage (3x), VIN (2x), others (1x)
    if (col.key === 'stage') {
      fieldWrapper.style.flex = '3 1 0';
    } else if (col.key === 'vin') {
      fieldWrapper.style.flex = '2 1 0';
    } else {
      fieldWrapper.style.flex = '1 1 0';
    }

    const label = document.createElement('label');
    label.className = 'crm-label';
    label.style.fontSize = '10px';
    label.style.fontWeight = 'bold';
    label.style.lineHeight = '1';
    label.style.marginBottom = '2px';
    label.textContent = col.label;

    let input;

    if (!col.editable) {
      input = document.createElement('span');
      input.className = 'crm-value-static';
      input.textContent = value || '—';
      input.style.fontSize = '12px';
    } else if (col.type === 'select') {
      input = document.createElement('select');
      input.className = 'crm-input crm-select';
      input.style.fontSize = '12px';
      input.style.width = '100%';
      input.style.padding = '2px 4px';
      input.style.textAlign = 'center';
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
      input.style.width = '100%';
      input.style.fontSize = '12px';
      input.style.padding = '2px 4px';
      input.style.resize = 'vertical';
      input.style.overflowWrap = 'break-word';
      input.style.wordWrap = 'break-word';
      input.style.overflow = 'hidden';
      const adjustHeight = () => {
        input.style.height = 'auto';
        const newHeight = Math.max(input.scrollHeight, 22);
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
      input.style.fontSize = '12px';
      input.style.overflow = 'hidden';
      input.style.textOverflow = 'ellipsis';
      input.style.width = '100%';
      input.style.padding = '2px 4px';
      input.style.textAlign = 'center';
      input.addEventListener('input', () => {
        pendingChanges[col.col] = input.value;
        triggerAutoSave();
        updateSaveButtonState();
      });
    }

    fieldWrapper.appendChild(label);
    fieldWrapper.appendChild(input);
    mainRow.appendChild(fieldWrapper);
  });

  fieldsEl.appendChild(mainRow);

  // Render notes field full width below
  if (noteCol) {
    const colIndex = COLUMNS.indexOf(noteCol);
    const value = (rowData[colIndex] || '').toString().trim();

    const notesWrapper = document.createElement('div');
    notesWrapper.style.display = 'flex';
    notesWrapper.style.flexDirection = 'column';
    notesWrapper.style.gap = '2px';

    const label = document.createElement('label');
    label.className = 'crm-label';
    label.style.fontSize = '10px';
    label.style.fontWeight = 'bold';
    label.style.lineHeight = '1';
    label.style.marginBottom = '2px';
    label.textContent = noteCol.label;

    const textarea = document.createElement('textarea');
    textarea.className = 'crm-input crm-textarea';
    textarea.value = value;
    textarea.rows = 1;
    textarea.style.width = '100%';
    textarea.style.fontSize = '12px';
    textarea.style.padding = '2px 4px';
    textarea.style.resize = 'vertical';
    textarea.style.overflowWrap = 'break-word';
    textarea.style.wordWrap = 'break-word';
    textarea.style.overflow = 'hidden';
    const adjustHeight = () => {
      textarea.style.height = 'auto';
      const newHeight = Math.max(textarea.scrollHeight, 22);
      textarea.style.height = Math.min(newHeight, 200) + 'px';
    };
    textarea.addEventListener('input', () => {
      pendingChanges[noteCol.col] = textarea.value;
      adjustHeight();
      triggerAutoSave();
      updateSaveButtonState();
    });
    setTimeout(adjustHeight, 0);

    notesWrapper.appendChild(label);
    notesWrapper.appendChild(textarea);
    fieldsEl.appendChild(notesWrapper);
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
          setStatus(`Row ${currentRowIndex}`);
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

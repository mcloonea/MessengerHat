// content.js - Injects CRM panel into Facebook Messenger

console.log('Messenger CRM loaded');

// ── State ─────────────────────────────────────────────────────────────────────
let currentThreadId = null;
let currentRowIndex = null;
let panelEl = null;
let lastThreads = [];
let pendingChanges = {};
let autoSaveTimer = null;
const EXTENSION_REFRESH_MESSAGE = 'Extension unavailable. Refresh Messenger.';

// ── Column definitions (matches your sheet exactly) ───────────────────────────
const COLUMNS = [
  { key: 'handler',   col: 'A', label: 'Handler',    editable: false },
  { key: 'last',      col: 'B', label: 'Last',        editable: true, type: 'text' },
  { key: 'notes',     col: 'C', label: 'Notes',       editable: true, type: 'textarea' },
  { key: 'stage',     col: 'D', label: 'Stage',       editable: true, type: 'select',
    options: ['Collecting Info', 'Require Review', 'Require Kevin Review', 'Reviewed', 'Working', 'Hot', 'Purchased', 'Dead - History', 'Dead - Sold', 'Dead - Other', 'Cold', 'Dead - Listing Removal'] },
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

function hasExtensionRuntime() {
  return typeof chrome !== 'undefined'
    && !!chrome.runtime
    && typeof chrome.runtime.sendMessage === 'function';
}

function getExtensionRuntimeError() {
  return EXTENSION_REFRESH_MESSAGE;
}

function showExtensionUnavailable(message = EXTENSION_REFRESH_MESSAGE) {
  const loading = document.getElementById('crm-loading');
  const debug = document.getElementById('crm-debug');
  const errorInline = document.getElementById('crm-error-inline');
  const saveStatus = document.getElementById('crm-save-status-header');

  if (loading) loading.style.display = 'none';
  if (debug) debug.style.display = 'none';
  if (errorInline) {
    errorInline.textContent = message;
    errorInline.style.display = 'inline';
  }
  if (saveStatus) saveStatus.textContent = message;

  setStatus('Extension unavailable');
}

function sendExtensionMessage(message) {
  if (!hasExtensionRuntime()) {
    const error = getExtensionRuntimeError();
    console.error('[CRM] Extension runtime missing for message:', message.type);
    showExtensionUnavailable(error);
    return Promise.resolve({ success: false, error, unavailable: true });
  }

  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      const runtimeError = chrome.runtime?.lastError;
      if (runtimeError) {
        const error = runtimeError.message || getExtensionRuntimeError();
        const userMessage = getExtensionRuntimeError();
        console.error('[CRM] Extension message failed:', message.type, error);
        showExtensionUnavailable(userMessage);
        resolve({ success: false, error: userMessage, detail: error, unavailable: true });
        return;
      }

      resolve(response || { success: false, error: 'Empty response from extension background' });
    });
  });
}

// ── Parse thread name from Messenger sidebar ──────────────────────────────────
function parseThreadName(fullName) {
  // "Kim · 2024 Volkswagen Atlas · extra facebook model info" → { customer: "Kim", vehicle: "2024 Volkswagen Atlas" }
  // Only take first two parts separated by ·, ignore extra info Facebook adds
  const parts = fullName.split(' · ');
  if (parts.length === 1) return { customer: fullName.trim(), vehicle: '' };
  const customer = parts[0].trim();
  const vehicle = parts[1]?.trim() || '';
  return { customer, vehicle };
}

// ── Get current open thread name ──────────────────────────────────────────────
function getCurrentThreadName() {
  // Try the conversation header first
  const headerSelectors = [
    'h2[dir="auto"]',
    '[data-testid="conversation-title"]',
    'span[dir="auto"] span[dir="auto"]'
  ];

  for (const sel of headerSelectors) {
    const els = document.querySelectorAll(sel);
    for (const el of els) {
      const text = el.innerText?.trim();
      if (text && text.includes('·')) return text;
      if (text && text.length > 2 && !text.includes('Messenger')) return text;
    }
  }

  // Fallback: read from URL thread ID and find in sidebar
  const match = window.location.href.match(/\/t\/(\d+)/);
  if (!match) return null;
  const threadId = match[1];

  const links = document.querySelectorAll(`a[href*="/t/${threadId}"]`);
  for (const link of links) {
    const span = link.querySelector('span[dir="auto"]');
    if (span) return span.innerText?.trim();
  }

  // Last fallback: parse from aria-label if present
  const conv = document.querySelector('[aria-label^="Conversation titled"]');
  if (conv) {
    const label = conv.getAttribute('aria-label');
    if (label) {
      const text = label.replace('Conversation titled ', '').trim();
      if (text) return text;
    }
  }

  return null;
}

// ── Get thread ID from URL ────────────────────────────────────────────────────
function getThreadIdFromUrl() {
  const match = window.location.href.match(/\/t\/(\d+)/);
  return match ? match[1] : null;
}

// ── Inject or update panel ────────────────────────────────────────────────────
function injectPanel() {
  if (document.getElementById('crm-panel')) return;

  const conv = document.querySelector('[aria-label^="Conversation titled"]');
  if (!conv) return;

  // Traverse down 4 levels to find the insertion point
  let target = conv;
  for (let i = 0; i < 4; i++) {
    target = target.firstElementChild;
    if (!target) return;
  }

  panelEl = document.createElement('div');
  panelEl.id = 'crm-panel';
  panelEl.innerHTML = `
    <div class="crm-header">
      <span class="crm-title">Messenger Hat</span>
      <span class="crm-error-inline" id="crm-error-inline" style="font-size:12px;margin-left:8px;display:none"></span>
      <span class="crm-status" id="crm-status">Loading...</span>
      <div class="crm-save-header" id="crm-save-header" style="display:none;gap:6px;margin-left:auto;">
        <button class="crm-save-btn-header" id="crm-save-btn-header">Save</button>
        <span class="crm-save-status-header" id="crm-save-status-header" style="font-size:10px;align-self:center;"></span>
      </div>
      <button class="crm-toggle" id="crm-toggle">▲</button>
    </div>
    <div class="crm-body" id="crm-body">
      <div class="crm-debug" id="crm-debug" style="background:#f0f0f0;padding:8px;margin-bottom:8px;font-size:11px;border-left:3px solid #0066cc;display:none"></div>
      <div class="crm-loading" id="crm-loading">Looking up lead...</div>
      <div class="crm-fields" id="crm-fields" style="display:none"></div>
      <div class="crm-no-match" id="crm-no-match" style="display:none">
        <span>No match found.</span>
        <a href="https://docs.google.com/spreadsheets/d/1HAOKyXof_UqWnkzg6ja_0QAxVkFUaGI8_LB66JJ-rGM/edit" target="_blank">Open Sheet →</a>
      </div>
      <div class="crm-save-bar" id="crm-save-bar" style="display:none">
        <button class="crm-save-btn" id="crm-save-btn">Save to Sheet</button>
        <span class="crm-save-status" id="crm-save-status"></span>
      </div>
    </div>
  `;

  // Insert panel as first child of target element
  target.insertBefore(panelEl, target.firstChild);

  // Toggle collapse
  document.getElementById('crm-toggle').addEventListener('click', () => {
    const body = document.getElementById('crm-body');
    const btn = document.getElementById('crm-toggle');
    if (body.style.display === 'none') {
      body.style.display = '';
      btn.textContent = '▲';
    } else {
      body.style.display = 'none';
      btn.textContent = '▼';
    }
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

  // Render main fields in a flexible row - size to content, expand to fill
  const mainRow = document.createElement('div');
  mainRow.style.display = 'flex';
  mainRow.style.flexWrap = 'nowrap';
  mainRow.style.gap = '4px';

  mainCols.forEach((col, i) => {
    const colIndex = COLUMNS.indexOf(col);
    const value = (rowData[colIndex] || '').toString().trim();
    const hasContent = value.length > 0;

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
      const newHeight = Math.max(textarea.scrollHeight, 22); // min 22px to match other inputs
      textarea.style.height = Math.min(newHeight, 200) + 'px';
    };
    textarea.addEventListener('input', () => {
      pendingChanges[noteCol.col] = textarea.value;
      adjustHeight();
      triggerAutoSave();
      updateSaveButtonState();
    });
    // Initial height adjustment
    setTimeout(adjustHeight, 0);

    notesWrapper.appendChild(label);
    notesWrapper.appendChild(textarea);
    fieldsEl.appendChild(notesWrapper);
  }

  // Save button handler (in header) - manual save
  const saveBtn = document.getElementById('crm-save-btn-header');
  if (saveBtn) {
    saveBtn.onclick = () => {
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
      performSave();
    };
  }
}

function showSaveBar() {
  const bar = document.getElementById('crm-save-header');
  const btn = document.getElementById('crm-save-btn-header');
  if (bar) {
    bar.style.display = 'flex';
    if (btn) btn.disabled = false;
  }
}

function hideSaveBar() {
  const bar = document.getElementById('crm-save-header');
  if (bar) bar.style.display = 'none';
}

function updateSaveButtonState() {
  const saveBtn = document.getElementById('crm-save-btn-header');
  if (!saveBtn) return;

  // Check if there are any pending changes
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
  // Clear any existing timer
  if (autoSaveTimer) clearTimeout(autoSaveTimer);

  // Show save bar immediately
  showSaveBar();
  const saveBtn = document.getElementById('crm-save-btn-header');
  if (saveBtn) {
    saveBtn.textContent = 'Saving...';
    saveBtn.style.backgroundColor = '#666';
  }

  // Auto-save after 300ms (to batch rapid changes while typing)
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

  // Always update last contact date (col B) on save
  const today = new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
  pendingChanges['B'] = pendingChanges['B'] || today;

  sendExtensionMessage({ type: 'UPDATE_ROW', rowIndex: currentRowIndex, updates: pendingChanges })
    .then((res) => {
      const status = document.getElementById('crm-save-status-header');
      if (res?.success) {
        saveBtn.textContent = 'Saved ✓';
        saveBtn.style.backgroundColor = '#28a745';
        if (status) status.textContent = '';
        // Clear pending
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

// ── Look up current thread in sheet ──────────────────────────────────────────
function lookupCurrentThread() {
  const threadId = getThreadIdFromUrl();
  if (!threadId || threadId === currentThreadId) return;
  currentThreadId = threadId;
  currentRowIndex = null;

  injectPanel();

  const threadName = getCurrentThreadName();
  if (!threadName) {
    setStatus('No thread name found');
    // Retry after a short delay in case DOM isn't ready
    setTimeout(() => lookupCurrentThread(), 500);
    return;
  }

  const { customer, vehicle } = parseThreadName(threadName);
  setStatus(`Looking up: ${customer}`);
  showDebug(`🔍 Searching: "${customer}" + "${vehicle}"`);

  sendExtensionMessage({ type: 'FIND_ROW', customerName: customer, vehicleName: vehicle })
    .then((res) => {
      if (res?.success && res.result) {
        if (res.result.error) {
          // Multiple matches found
          showError();
        } else {
          currentRowIndex = res.result.rowIndex;
          const rowData = res.result.rowData;

          // Pad to 15 columns
          while (rowData.length < 15) rowData.push('');

          setStatus(`Row ${currentRowIndex}`);
          hideDebug();
          showFields(rowData);
        }
        return;
      }

      if (res?.unavailable) {
        return;
      }

      showNoRowFound();
      // Retry after a delay in case sheet data wasn't loaded yet
      setTimeout(() => lookupCurrentThread(), 1000);
    });
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

function showDebug(text) {
  const debug = document.getElementById('crm-debug');
  if (debug) {
    debug.textContent = text;
    debug.style.display = 'block';
  }
}

function hideDebug() {
  const debug = document.getElementById('crm-debug');
  if (debug) debug.style.display = 'none';
}

function showError() {
  const loading = document.getElementById('crm-loading');
  const fields = document.getElementById('crm-fields');
  const noMatch = document.getElementById('crm-no-match');
  const debug = document.getElementById('crm-debug');
  const errorInline = document.getElementById('crm-error-inline');
  if (loading) loading.style.display = 'none';
  if (fields) fields.style.display = 'none';
  if (noMatch) noMatch.style.display = 'none';
  if (debug) debug.style.display = 'none';
  if (errorInline) {
    errorInline.textContent = 'error: multiple matches';
    errorInline.style.display = 'inline';
  }
}

function showNoRowFound() {
  const loading = document.getElementById('crm-loading');
  const fields = document.getElementById('crm-fields');
  const noMatch = document.getElementById('crm-no-match');
  const debug = document.getElementById('crm-debug');
  const errorInline = document.getElementById('crm-error-inline');
  if (loading) loading.style.display = 'none';
  if (fields) fields.style.display = 'none';
  if (noMatch) noMatch.style.display = 'none';
  if (debug) debug.style.display = 'none';
  if (errorInline) {
    errorInline.textContent = 'no row found';
    errorInline.style.display = 'inline';
  }
}

// ── Thread list scanner (for inbound detection) ───────────────────────────────
function parseThreads() {
  const results = [];
  const links = document.querySelectorAll('a[href*="/t/"]');

  links.forEach(link => {
    const href = link.getAttribute('href');
    const threadId = href?.match(/\/t\/(\d+)\//)?.[1];
    if (!threadId) return;

    const spans = link.querySelectorAll('span[dir="auto"]');
    const name = spans[0]?.innerText?.trim();
    const lastMsg = spans[1]?.innerText?.trim();
    const sentByYou = lastMsg?.startsWith('You:');
    const abbr = link.querySelector('abbr');
    const timestamp = abbr?.getAttribute('aria-label') || abbr?.innerText?.trim();
    const seenEl = link.querySelector('[aria-label^="Seen by"]');
    const seenBy = seenEl?.getAttribute('aria-label');

    if (name) results.push({ name, threadId, lastMsg, sentByYou, timestamp, seenBy });
  });

  return results;
}

// ── Detect inbound messages and POST to backend ───────────────────────────────
function checkInbound(newThreads) {
  if (lastThreads.length === 0) {
    lastThreads = newThreads;
    return;
  }

  newThreads.forEach(thread => {
    const prev = lastThreads.find(t => t.threadId === thread.threadId);
    if (!prev) return;

    // If it was sentByYou before and now it's not — they replied
    if (prev.sentByYou && !thread.sentByYou) {
      console.log(`[CRM] Inbound from ${thread.name}: ${thread.lastMsg}`);
      notifyBackend(thread);
    }
  });

  lastThreads = newThreads;
}

function notifyBackend(thread) {
  fetch('http://localhost:5000/inbound', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: thread.name,
      threadId: thread.threadId,
      lastMsg: thread.lastMsg,
      timestamp: thread.timestamp,
      seenBy: thread.seenBy
    })
  }).catch(() => {}); // silent fail if backend not running
}

// ── Wait for conversation DOM to exist (Messenger renders async) ──────────────
let waitForConversationObserver = null;
let waitForConversationCallbacks = [];

function waitForConversation(callback) {
  const existing = document.querySelector('[aria-label^="Conversation titled"]');
  if (existing) {
    callback();
    return;
  }

  waitForConversationCallbacks.push(callback);
  if (waitForConversationObserver) return;

  waitForConversationObserver = new MutationObserver(() => {
    if (!document.querySelector('[aria-label^="Conversation titled"]')) return;
    waitForConversationObserver.disconnect();
    waitForConversationObserver = null;

    const callbacks = waitForConversationCallbacks;
    waitForConversationCallbacks = [];
    callbacks.forEach((cb) => cb());
  });

  waitForConversationObserver.observe(document.body, { subtree: true, childList: true });
}

// ── Watch for URL/thread changes ──────────────────────────────────────────────
let lastUrl = window.location.href;

let debounceTimer = null;
const observer = new MutationObserver(() => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    // Check if URL changed (new thread opened)
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      waitForConversation(() => lookupCurrentThread());
    }

    // Scan thread list for inbound changes
    const threads = parseThreads();
    if (threads.length > 0) {
      checkInbound(threads);
      console.table(threads);
    }
  }, 800);
});

observer.observe(document.body, { subtree: true, childList: true });

// ── Initial load ──────────────────────────────────────────────────────────────
waitForConversation(() => {
  const threads = parseThreads();
  lastThreads = threads;
  console.log('[CRM] Initial thread scan:', threads.length, 'threads');
  lookupCurrentThread();
});

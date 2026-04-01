// content.js - Injects CRM panel into Facebook Messenger

console.log('Messenger CRM loaded');

// ── State ─────────────────────────────────────────────────────────────────────
let currentThreadId = null;
let currentRowIndex = null;
let panelEl = null;
let lastThreads = [];

// ── Column definitions (matches your sheet exactly) ───────────────────────────
const COLUMNS = [
  { key: 'handler',   col: 'A', label: 'Handler',    editable: false },
  { key: 'last',      col: 'B', label: 'Last Contact', editable: true, type: 'text' },
  { key: 'notes',     col: 'C', label: 'Notes',       editable: true, type: 'textarea' },
  { key: 'stage',     col: 'D', label: 'Stage',       editable: true, type: 'select',
    options: ['Hot', 'Warm', 'Cold', 'Appt Set', 'Appt Done', 'Pickup', 'Purchased', 'Dead - Sold', 'Dead - Listing Removed', 'Dead - Other'] },
  { key: 'source',    col: 'E', label: 'Source',      editable: false },
  { key: 'customer',  col: 'F', label: 'Customer',    editable: false },
  { key: 'mileage',   col: 'G', label: 'Mileage',     editable: true, type: 'text' },
  { key: 'vehicle',   col: 'H', label: 'Vehicle',     editable: false },
  { key: 'vin',       col: 'I', label: 'VIN',         editable: true, type: 'text' },
  { key: 'condition', col: 'J', label: 'Condition',   editable: true, type: 'text' },
  { key: 'initial',   col: 'K', label: 'Their Ask',   editable: true, type: 'text' },
  { key: 'counter',   col: 'L', label: 'Counter',     editable: true, type: 'text' },
  { key: 'andrew',    col: 'M', label: 'Andrew #',    editable: true, type: 'text' },
  { key: 'kevin',     col: 'N', label: "Kevin's #",   editable: true, type: 'text' },
  { key: 'mmr',       col: 'O', label: 'MMR',         editable: true, type: 'text' },
];

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
      <span class="crm-title">CRM</span>
      <span class="crm-status" id="crm-status">Loading...</span>
      <button class="crm-toggle" id="crm-toggle">▲</button>
    </div>
    <div class="crm-body" id="crm-body">
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
  const pendingChanges = {};

  COLUMNS.forEach((col, i) => {
    const value = (rowData[i] || '').toString().trim();
    const row = document.createElement('div');
    row.className = 'crm-field-row';

    const label = document.createElement('label');
    label.className = 'crm-label';
    label.textContent = col.label;

    let input;

    if (!col.editable) {
      input = document.createElement('span');
      input.className = 'crm-value-static';
      input.textContent = value || '—';
    } else if (col.type === 'textarea') {
      input = document.createElement('textarea');
      input.className = 'crm-input crm-textarea';
      input.value = value;
      input.rows = 3;
      input.addEventListener('input', () => {
        pendingChanges[col.col] = input.value;
        showSaveBar();
      });
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
      // If current value isn't in options, add it
      if (value && !col.options.includes(value)) {
        const o = document.createElement('option');
        o.value = value;
        o.textContent = value;
        o.selected = true;
        input.insertBefore(o, input.firstChild);
      }
      input.addEventListener('change', () => {
        pendingChanges[col.col] = input.value;
        showSaveBar();
      });
    } else {
      input = document.createElement('input');
      input.type = 'text';
      input.className = 'crm-input';
      input.value = value;
      input.addEventListener('input', () => {
        pendingChanges[col.col] = input.value;
        showSaveBar();
      });
    }

    row.appendChild(label);
    row.appendChild(input);
    fieldsEl.appendChild(row);
  });

  // Save button handler
  const saveBtn = document.getElementById('crm-save-btn');
  if (saveBtn) {
    saveBtn.onclick = async () => {
      if (!currentRowIndex || Object.keys(pendingChanges).length === 0) return;
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
      
      // Always update last contact date (col B) on save
      const today = new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
      pendingChanges['B'] = pendingChanges['B'] || today;

      chrome.runtime.sendMessage(
        { type: 'UPDATE_ROW', rowIndex: currentRowIndex, updates: pendingChanges },
        (res) => {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save to Sheet';
          const status = document.getElementById('crm-save-status');
          if (res?.success) {
            status.textContent = '✓ Saved';
            status.style.color = '#1a7a4a';
            // Clear pending
            Object.keys(pendingChanges).forEach(k => delete pendingChanges[k]);
            setTimeout(() => { status.textContent = ''; hideSaveBar(); }, 2000);
          } else {
            status.textContent = '✗ Error';
            status.style.color = '#c0392b';
          }
        }
      );
    };
  }
}

function showSaveBar() {
  const bar = document.getElementById('crm-save-bar');
  if (bar) bar.style.display = 'flex';
}

function hideSaveBar() {
  const bar = document.getElementById('crm-save-bar');
  if (bar) bar.style.display = 'none';
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

  chrome.runtime.sendMessage(
    { type: 'FIND_ROW', customerName: customer, vehicleName: vehicle },
    (res) => {
      if (res?.success && res.result) {
        currentRowIndex = res.result.rowIndex;
        const rowData = res.result.rowData;

        // Pad to 15 columns
        while (rowData.length < 15) rowData.push('');

        setStatus(`Row ${currentRowIndex} · ${rowData[3] || 'No Stage'}`);
        showFields(rowData);
      } else {
        setStatus('No match');
        showNoMatch();
        // Retry after a delay in case sheet data wasn't loaded yet
        setTimeout(() => lookupCurrentThread(), 1000);
      }
    }
  );
}

function setStatus(text) {
  const el = document.getElementById('crm-status');
  if (el) el.textContent = text;
}

function showFields(rowData) {
  const loading = document.getElementById('crm-loading');
  const fields = document.getElementById('crm-fields');
  const noMatch = document.getElementById('crm-no-match');
  if (loading) loading.style.display = 'none';
  if (noMatch) noMatch.style.display = 'none';
  if (fields) {
    fields.style.display = 'grid';
    renderFields(rowData);
  }
}

function showNoMatch() {
  const loading = document.getElementById('crm-loading');
  const fields = document.getElementById('crm-fields');
  const noMatch = document.getElementById('crm-no-match');
  if (loading) loading.style.display = 'none';
  if (fields) fields.style.display = 'none';
  if (noMatch) noMatch.style.display = 'flex';
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

// content.js - Detects thread changes and notifies the background service worker

console.log('Messenger CRM content script loaded');

// ── State ─────────────────────────────────────────────────────────────────────
let currentThreadId = null;
let lastThreads = [];

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

// ── Look up current thread and notify background ───────────────────────────────
function lookupCurrentThread() {
  const threadId = getThreadIdFromUrl();
  if (!threadId || threadId === currentThreadId) return;
  currentThreadId = threadId;

  const threadName = getCurrentThreadName();
  if (!threadName) {
    console.log('[CRM] No thread name found, retrying...');
    setTimeout(() => lookupCurrentThread(), 500);
    return;
  }

  const { customer, vehicle } = parseThreadName(threadName);
  console.log('[CRM] Thread changed:', { customer, vehicle, threadId });

  // Notify background to open side panel and forward thread info
  chrome.runtime.sendMessage({
    type: 'THREAD_CHANGED',
    threadId,
    threadName,
    customer,
    vehicle
  }, (response) => {
    if (chrome.runtime?.lastError) {
      console.error('[CRM] Failed to send THREAD_CHANGED:', chrome.runtime.lastError);
    }
  });
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

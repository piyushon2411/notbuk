// MV3 Background service worker: adds a context menu to append selected text

// Create the context menu on install/update
chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.contextMenus.create({
      id: 'notbuk-append-selection',
      title: 'Add to Notbuk Tab',
      contexts: ['selection']
    });
  } catch (e) {
    // Ignore duplicate menu errors during dev reloads
  }
});

// Escape HTML entities to avoid breaking editor HTML when appending
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Convert newline characters to <br> for HTML rendering
function nl2br(str) {
  return str.split('\n').join('<br>');
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== 'notbuk-append-selection') return;
  const selection = (info.selectionText || '').trim();
  if (!selection) return;

  // Append safely to existing noteContent in storage
  chrome.storage.local.get(['noteContent'], (res) => {
    const currentHtml = typeof res.noteContent === 'string' ? res.noteContent : '';
    const safeHtml = nl2br(escapeHtml(selection));
    const snippet = `<div>${safeHtml}</div>`; // block-level wrapper to avoid inline breakage
    const nextHtml = currentHtml ? `${currentHtml}${snippet}` : snippet;
    chrome.storage.local.set({ noteContent: nextHtml });
  });
});

// MV3 Background service worker: adds a context menu to append selected text/HTML

// Create the context menu on install/update
chrome.runtime.onInstalled.addListener(() => { ensureContextMenu(); });
chrome.runtime.onStartup.addListener(() => { ensureContextMenu(); });

function ensureContextMenu() {
  const optionsBase = {
    id: 'notbuk-append-selection',
    title: 'Add to Notbuk Tab',
    contexts: ['selection']
  };
  try {
    // Remove existing to avoid duplicates across restarts
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create(optionsBase, () => {});
    });
  } catch (_) {
    // As a last resort, try simple create
    try { chrome.contextMenus.create(optionsBase, () => {}); } catch (_) {}
  }
}

// No icons property support for contextMenus in current Chrome; using default icon

// Utility fallback: convert text newlines to HTML BRs if we cannot capture HTML
function nl2brTextToHtml(text) {
  return (text || '').split('\n').map(t => `<p>${t ? t.replace(/</g,'&lt;').replace(/>/g,'&gt;') : '<br>'}</p>`).join('');
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'notbuk-append-selection') return;
  const selectionText = (info.selectionText || '').trim();
  if (!selectionText && !tab) return;

  // Try to capture HTML selection from the page using scripting API
  let html = '';
  try {
    const tabId = tab && tab.id ? tab.id : (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
    if (tabId) {
      const [{ result } = {}] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          try {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) return { html: '', text: '' };
            const container = document.createElement('div');
            for (let i = 0; i < sel.rangeCount; i++) {
              const frag = sel.getRangeAt(i).cloneContents();
              container.appendChild(frag);
            }
            // Rewrite relative URLs to absolute for images and links so they work in the extension page
            const toAbs = (u) => {
              try { return new URL(u, location.href).href; } catch { return u; }
            };
            container.querySelectorAll('img').forEach(img => {
              if (img.hasAttribute('src')) img.setAttribute('src', toAbs(img.getAttribute('src')));
              if (img.hasAttribute('srcset')) {
                const srcset = img.getAttribute('srcset');
                if (srcset) {
                  const parts = srcset.split(',').map(s => s.trim()).filter(Boolean).map(entry => {
                    const m = entry.split(/\s+/);
                    const url = m[0];
                    const desc = m.slice(1).join(' ');
                    return `${toAbs(url)}${desc ? ' ' + desc : ''}`;
                  });
                  img.setAttribute('srcset', parts.join(', '));
                }
              }
            });
            container.querySelectorAll('source[srcset]').forEach(el => {
              const srcset = el.getAttribute('srcset');
              if (srcset) {
                const parts = srcset.split(',').map(s => s.trim()).filter(Boolean).map(entry => {
                  const m = entry.split(/\s+/);
                  const url = m[0];
                  const desc = m.slice(1).join(' ');
                  return `${toAbs(url)}${desc ? ' ' + desc : ''}`;
                });
                el.setAttribute('srcset', parts.join(', '));
              }
            });
            container.querySelectorAll('a[href]').forEach(a => {
              a.setAttribute('href', toAbs(a.getAttribute('href')));
            });
            return { html: container.innerHTML, text: sel.toString() };
          } catch (_) { return { html: '', text: '' }; }
        },
        world: 'MAIN'
      });
      html = (result && result.html) || '';
    }
  } catch (_) {}

  // If no HTML, fall back to text → HTML paragraphs
  if (!html) html = nl2brTextToHtml(selectionText);
  if (!html) return;

  // Append to existing noteContent (sanitization happens in UI on load)
  chrome.storage.local.get(['noteContent'], (res) => {
    const currentHtml = typeof res.noteContent === 'string' ? res.noteContent : '';
    const snippet = `<div class="nb-clip">${html}</div>`;
    const nextHtml = currentHtml ? `${currentHtml}${snippet}` : snippet;
    const now = Date.now();
    chrome.storage.local.set({ noteContent: nextHtml, noteContentUpdatedAt: now, noteContentUpdatedBy: 'background' });
  });
});

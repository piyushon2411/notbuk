document.addEventListener('DOMContentLoaded', () => {
  // Provide a light-weight shim so index.html can work outside the extension
  // (useful for dev/manual testing). Chrome will provide the real API in the
  // extension context; this shim only mirrors the subset we use.
  (function ensureChromeStorageShim(){
    if (typeof window === 'undefined') return;
    const hasChromeStorage = window.chrome && chrome.storage && chrome.storage.local;
    if (hasChromeStorage) return;
    const listeners = [];
    function safeParse(v){ try { return JSON.parse(v); } catch { return v; } }
    const local = {
      get(keys, cb){
        try {
          const out = {};
          if (Array.isArray(keys)) {
            keys.forEach(k => { const v = localStorage.getItem(k); out[k] = v == null ? undefined : safeParse(v); });
          } else if (typeof keys === 'string') {
            const v = localStorage.getItem(keys); out[keys] = v == null ? undefined : safeParse(v);
          } else if (keys && typeof keys === 'object') {
            Object.keys(keys).forEach(k => { const v = localStorage.getItem(k); out[k] = v == null ? keys[k] : safeParse(v); });
          } else {
            for (let i=0;i<localStorage.length;i++){ const k = localStorage.key(i); out[k] = safeParse(localStorage.getItem(k)); }
          }
          cb && cb(out);
        } catch(_) { cb && cb({}); }
      },
      set(items, cb){
        const changes = {};
        try {
          Object.entries(items).forEach(([k,v]) => {
            const prevRaw = localStorage.getItem(k);
            const prev = prevRaw == null ? undefined : safeParse(prevRaw);
            const nextRaw = typeof v === 'string' ? v : JSON.stringify(v);
            localStorage.setItem(k, nextRaw);
            const next = safeParse(nextRaw);
            changes[k] = { oldValue: prev, newValue: next };
          });
        } finally {
          cb && cb();
          // Emit same-tab change
          listeners.forEach(fn => { try { fn(changes, 'local'); } catch(_) {} });
        }
      }
    };
    window.chrome = window.chrome || {};
    chrome.storage = chrome.storage || {};
    chrome.storage.local = local;
    chrome.storage.onChanged = chrome.storage.onChanged || {
      addListener(fn){ if (typeof fn === 'function') listeners.push(fn); },
      removeListener(fn){ const i = listeners.indexOf(fn); if (i>=0) listeners.splice(i,1); }
    };
    // Cross-tab change propagation
    window.addEventListener('storage', (e) => {
      if (!e.key) return;
      const change = {}; change[e.key] = { oldValue: safeParse(e.oldValue), newValue: safeParse(e.newValue) };
      listeners.forEach(fn => { try { fn(change, 'local'); } catch(_) {} });
    });
  })();
  const clientId = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : (Math.random().toString(36).slice(2) + Date.now());
  const editor = document.getElementById('editor');
  const darkModeToggle = document.getElementById('darkModeToggle');
  const menuButton = document.querySelector('.menu-button');
  const formattingMenu = document.getElementById('formattingMenu');
  const wordCount = document.getElementById('wordCount');
  const charCount = document.getElementById('charCount');
  const selectionToolbar = document.getElementById('selectionToolbar');
  const shortcutsBtn = document.getElementById('shortcutsBtn');
  const shortcutsOverlay = document.getElementById('shortcutsOverlay');
  const closeShortcuts = document.getElementById('closeShortcuts');
  let isComposing = false; // Track IME composition state to avoid intercepting Enter

  // --- Lightweight debug logger ---
  let debugEnabled = false;
  const debugBuffer = [];
  function ensureDebugOverlay() {
    let box = document.getElementById('nb-debug');
    if (!box) {
      box = document.createElement('div');
      box.id = 'nb-debug';
      box.style.cssText = 'position:fixed;right:8px;bottom:8px;max-width:40vw;max-height:40vh;overflow:auto;background:rgba(0,0,0,0.75);color:#0f0;font:12px/1.4 monospace;padding:8px;border-radius:6px;z-index:99999;display:none;';
      document.body.appendChild(box);
    }
    return box;
  }
  function dlog(event, info={}) {
    if (!debugEnabled) return;
    const pre = editor.innerHTML;
    const sel = window.getSelection();
    const collapsed = !sel || sel.rangeCount===0 ? null : sel.getRangeAt(0).collapsed;
    const entry = { t: new Date().toISOString(), event, collapsed, ...info };
    debugBuffer.push(entry); if (debugBuffer.length>100) debugBuffer.shift();
    console.debug('[NotBuk]', entry);
    const box = ensureDebugOverlay();
    box.style.display = 'block';
    const last = JSON.stringify(entry).replace(/</g,'&lt;');
    const line = document.createElement('div');
    line.innerHTML = last;
    box.appendChild(line);
    while (box.childNodes.length>120) box.removeChild(box.firstChild);
  }
  function toggleDebug() {
    debugEnabled = !debugEnabled;
    const box = ensureDebugOverlay();
    box.style.display = debugEnabled ? 'block' : 'none';
    console.info('[NotBuk] debug', debugEnabled ? 'enabled' : 'disabled');
  }

  // Load dark mode preference from local storage
  chrome.storage.local.get(['darkMode'], (result) => {
    if (result.darkMode !== undefined) {
      document.body.classList.toggle('dark-mode', result.darkMode);
      editor.classList.toggle('dark-mode', result.darkMode);
      darkModeToggle.checked = result.darkMode;
    }
  });

  // Toggle dark mode and save the preference to local storage
  darkModeToggle.addEventListener('change', () => {
    const isDarkMode = darkModeToggle.checked;
    document.body.classList.toggle('dark-mode', isDarkMode);
    editor.classList.toggle('dark-mode', isDarkMode);
    chrome.storage.local.set({ darkMode: isDarkMode });
  });

  // IME composition: don't interfere with Enter while composing
  editor.addEventListener('compositionstart', () => { isComposing = true; });
  editor.addEventListener('compositionend', () => { isComposing = false; });

  // Show/hide the simple menu (theme + shortcuts)
  menuButton.addEventListener('click', () => {
    const next = formattingMenu.style.display === 'flex' ? 'none' : 'flex';
    formattingMenu.style.display = next;
    menuButton.setAttribute('aria-expanded', next === 'flex' ? 'true' : 'false');
  });
  document.addEventListener('click', (event) => {
    if (formattingMenu.style.display === 'flex' &&
        !formattingMenu.contains(event.target) && !menuButton.contains(event.target)) {
      formattingMenu.style.display = 'none';
    }
  });

  // Formatting utilities using Selection/Range APIs (no execCommand)
  function getEditorSelectionRange() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !editor.contains(sel.anchorNode) || !editor.contains(sel.focusNode)) return null;
    return sel.getRangeAt(0);
  }

  function wrapSelection(tagName) {
    const range = getEditorSelectionRange();
    if (!range || range.collapsed) return false;
    const wrapper = document.createElement(tagName);
    const contents = range.extractContents();
    wrapper.appendChild(contents);
    range.insertNode(wrapper);
    // Reselect the wrapped content
    const sel = window.getSelection();
    sel.removeAllRanges();
    const newRange = document.createRange();
    newRange.selectNodeContents(wrapper);
    sel.addRange(newRange);
    editor.focus();
    scheduleSave();
    updateCounts();
    return true;
  }

  function isEntirelyWrappedBy(tagNames) {
    const range = getEditorSelectionRange();
    if (!range || range.collapsed) return null;
    let node = range.commonAncestorContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    const match = node && (tagNames.includes(node.tagName));
    if (!match) return null;
    // Check range equals entire node content
    const testRange = document.createRange();
    testRange.selectNodeContents(node);
    return testRange.compareBoundaryPoints(Range.START_TO_START, range) === 0 &&
           testRange.compareBoundaryPoints(Range.END_TO_END, range) === 0 ? node : null;
  }

  function unwrapNode(node) {
    if (!node || !node.parentNode) return;
    while (node.firstChild) node.parentNode.insertBefore(node.firstChild, node);
    node.parentNode.removeChild(node);
  }

  function toggleInline(tagName, altTagName) {
    const cmdMap = { STRONG: 'bold', B: 'bold', EM: 'italic', I: 'italic', U: 'underline' };
    const cmd = cmdMap[tagName] || cmdMap[altTagName] || null;
    const range = getEditorSelectionRange();
    if (!range) return;
    const tags = [tagName];
    if (altTagName) tags.push(altTagName);

    // Prefer native editing engine for robust multi-line toggles
    try {
      if (cmd && document.execCommand) {
        dlog('toggleInline.execCommand.before', { cmd });
        document.execCommand(cmd, false, null);
        dlog('toggleInline.execCommand.after', { cmd });
        scheduleSave(); updateCounts(); updateToolbarStates();
        return;
      }
    } catch (_) { /* fall back to manual path below */ }
    const wrappedNode = isEntirelyWrappedBy(tags);
    if (wrappedNode) {
      unwrapNode(wrappedNode);
      scheduleSave();
      updateCounts();
      return;
    }
    // Collapsed selection handling: if caret is inside an existing matching inline
    // ancestor, split it at caret so further typing is outside (toggle off).
    if (range.collapsed) {
      const ancestor = findNearestInlineAncestor(tags);
      if (ancestor) {
        splitInlineAncestorAtCaret(ancestor);
        scheduleSave();
        updateCounts();
        updateToolbarStates();
        return;
      }
      // Collapsed and no ancestor: insert empty element and place caret inside (toggle on)
      const el = document.createElement(tagName);
      el.appendChild(document.createTextNode('\u200B'));
      range.insertNode(el);
      const sel = window.getSelection();
      const caret = document.createRange();
      caret.setStart(el.firstChild, 1);
      caret.collapse(true);
      sel.removeAllRanges();
      sel.addRange(caret);
      editor.focus();
      scheduleSave();
      updateCounts();
      updateToolbarStates();
      return;
    }

    // Non-collapsed selection: decide remove/apply based on whether ALL selected
    // text is already within the target tags (even if wrappers extend beyond selection).
    const originalRange = getEditorSelectionRange();
    const fullyHas = selectionFullyWithinTags(originalRange, tags);
    // Preserve selection via markers, then toggle.
    const markers = placeSelectionMarkers();
    // Ensure markers are not nested inside tags we intend to remove,
    // so cleaned content is reinserted outside those wrappers.
    liftSelectionMarkersOutOfTags(markers, tags);
    const workRange = rangeBetweenMarkers(markers);
    const anyHas = rangeContainsAnyTag(workRange, tags);
    const frag = workRange.extractContents();
    if (fullyHas || anyHas) {
      const cleaned = stripTagsFromFragment(frag, tags);
      workRange.insertNode(cleaned);
    } else {
      // Apply inline to each block separately to avoid invalid block-in-inline
      const applied = applyInlineToFragment(frag, tagName);
      workRange.insertNode(applied);
    }
    restoreSelectionFromMarkers(markers);
    removeSelectionMarkers(markers);
    editor.focus();
    scheduleSave();
    updateCounts();
    updateToolbarStates();
  }

  function findNearestInlineAncestor(tagNames) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    let el = sel.anchorNode;
    if (!el) return null;
    el = el.nodeType === Node.ELEMENT_NODE ? el : el.parentElement;
    while (el && el !== editor) {
      if (el.tagName && tagNames.includes(el.tagName)) return el;
      el = el.parentElement;
    }
    return null;
  }

  function rangeContainsAnyTag(range, tagNames) {
    try {
      const frag = range.cloneContents();
      const walker = document.createTreeWalker(frag, NodeFilter.SHOW_ELEMENT, {
        acceptNode(node) {
          return node.tagName && tagNames.includes(node.tagName)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP;
        }
      });
      return !!walker.nextNode();
    } catch(_) { return false; }
  }

  function textNodesInRange(range) {
    const result = [];
    try {
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          return range.intersectsNode && range.intersectsNode(node)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        }
      });
      let n; while ((n = walker.nextNode())) result.push(n);
    } catch(_) {}
    return result;
  }

  function nodeHasAncestorTag(node, tagNames) {
    let el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    while (el && el !== editor) {
      if (el.tagName && tagNames.includes(el.tagName)) return true;
      el = el.parentElement;
    }
    return false;
  }

  function selectionFullyWithinTags(range, tagNames) {
    if (!range) return false;
    const nodes = textNodesInRange(range);
    if (!nodes.length) return false;
    for (const n of nodes) {
      if (!nodeHasAncestorTag(n, tagNames)) return false;
    }
    return true;
  }

  function stripTagsFromFragment(fragment, tagNames) {
    const shouldRemove = new Set(tagNames);
    // Iteratively remove matching tags until none remain (handles deep nesting)
    while (true) {
      const toRemove = [];
      const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_ELEMENT, {
        acceptNode(node) {
          return node.tagName && shouldRemove.has(node.tagName)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP;
        }
      });
      let n;
      while ((n = walker.nextNode())) toRemove.push(n);
      if (toRemove.length === 0) break;
      for (const el of toRemove) {
        const frag = document.createDocumentFragment();
        while (el.firstChild) frag.appendChild(el.firstChild);
        el.replaceWith(frag);
      }
    }
    return fragment;
  }

  // When applying inline across multiple blocks, wrap contents of each block
  // individually; if only inline/text nodes are present, wrap all
  function applyInlineToFragment(fragment, tagName) {
    const blockTags = new Set(['P','DIV','H1','H2','H3']);
    let containsBlock = false;
    const children = Array.from(fragment.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE && blockTags.has(child.tagName)) {
        containsBlock = true;
        const w = document.createElement(tagName);
        while (child.firstChild) w.appendChild(child.firstChild);
        child.appendChild(w);
      }
    }
    if (!containsBlock) {
      const w = document.createElement(tagName);
      while (fragment.firstChild) w.appendChild(fragment.firstChild);
      const out = document.createDocumentFragment();
      out.appendChild(w);
      return out;
    }
    return fragment;
  }

  // Selection marker utilities to robustly preserve selection across DOM surgery
  function placeSelectionMarkers() {
    const sel = window.getSelection();
    const range = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
    const wasCollapsed = !range || range.collapsed;
    const start = document.createElement('span');
    const end = document.createElement('span');
    start.setAttribute('data-nb-sel-start', '1');
    end.setAttribute('data-nb-sel-end', '1');
    start.style.cssText = 'display:inline-block;width:0;height:0;overflow:hidden;';
    end.style.cssText = 'display:inline-block;width:0;height:0;overflow:hidden;';
    if (range) {
      const endRange = range.cloneRange();
      endRange.collapse(false); // end
      endRange.insertNode(end);
      const startRange = range.cloneRange();
      startRange.collapse(true); // start
      startRange.insertNode(start);
    } else {
      editor.appendChild(start);
      editor.appendChild(end);
    }
    return { start, end, wasCollapsed };
  }

  function rangeBetweenMarkers(markers) {
    const r = document.createRange();
    r.setStartAfter(markers.start);
    r.setEndBefore(markers.end);
    return r;
  }

  function restoreSelectionFromMarkers(markers) {
    const sel = window.getSelection();
    const r = document.createRange();
    if (markers.wasCollapsed) {
      r.setStartAfter(markers.start);
      r.collapse(true);
    } else {
      r.setStartAfter(markers.start);
      r.setEndBefore(markers.end);
    }
    sel.removeAllRanges();
    sel.addRange(r);
  }

  function removeSelectionMarkers(markers) {
    if (markers.start && markers.start.parentNode) markers.start.parentNode.removeChild(markers.start);
    if (markers.end && markers.end.parentNode) markers.end.parentNode.removeChild(markers.end);
  }

  function liftSelectionMarkersOutOfTags(markers, tagNames) {
    const isMatch = (el) => el && el.tagName && tagNames.includes(el.tagName);
    const lift = (marker, side) => {
      let parent = marker.parentElement;
      while (parent && parent !== editor && isMatch(parent)) {
        if (side === 'before') parent.parentNode.insertBefore(marker, parent);
        else parent.parentNode.insertBefore(marker, parent.nextSibling);
        parent = marker.parentElement;
      }
    };
    lift(markers.start, 'before');
    lift(markers.end, 'after');
  }

  function convertBlockTag(block, newTag) {
    if (!block || !block.parentNode) return block;
    const target = document.createElement(newTag);
    while (block.firstChild) target.appendChild(block.firstChild);
    block.parentNode.replaceChild(target, block);
    return target;
  }

  function clearFormatting() {
    const range = getEditorSelectionRange();
    if (!range) return;
    dlog('clearFormatting.begin', { collapsed: range.collapsed });
    // Collapsed: exit inline and normalize block to P
    if (range.collapsed) {
      // Exit inline wrappers by splitting repeatedly
      const inlineTags = ['STRONG','B','EM','I','U'];
      let ancestor;
      while ((ancestor = findNearestInlineAncestor(inlineTags))) {
        splitInlineAncestorAtCaret(ancestor);
      }
      const blk = getBlockAncestor(range.startContainer);
      if (blk && blk !== editor && blk.tagName !== 'P') convertBlockTag(blk, 'P');
      scheduleSave(); updateCounts(); updateToolbarStates();
      dlog('clearFormatting.end.collapsed', {});
      return;
    }
    // Selection case: normalize blocks to P, then strip inline tags inside selection
    const markers = placeSelectionMarkers();
    const workRange = rangeBetweenMarkers(markers);
    const blocks = blocksBetweenMarkers(markers);
    blocks.forEach((blk) => { if (blk.tagName !== 'P') convertBlockTag(blk, 'P'); });
    // Recompute range after block conversions
    // Also lift markers out of any inline wrappers so content is reinserted outside them
    const inlineTags = ['STRONG','B','EM','I','U','SPAN'];
    liftSelectionMarkersOutOfTags(markers, inlineTags);
    const afterBlocks = rangeBetweenMarkers(markers);
    // Unwrap any UL/OL within selection
    unwrapListsInRange(afterBlocks);
    // First try native removeFormat for robust inline clearing
    try {
      const sel = window.getSelection();
      const r = document.createRange();
      r.setStartAfter(markers.start); r.setEndBefore(markers.end);
      sel.removeAllRanges(); sel.addRange(r);
      if (document.execCommand) document.execCommand('removeFormat');
    } catch(_) {}
    // Then ensure no leftover inline wrappers remain
    const frag = afterBlocks.extractContents();
    const cleaned = stripTagsFromFragment(frag, ['STRONG','B','EM','I','U','SPAN']);
    afterBlocks.insertNode(cleaned);
    restoreSelectionFromMarkers(markers);
    removeSelectionMarkers(markers);
    scheduleSave(); updateCounts(); updateToolbarStates();
    dlog('clearFormatting.end.selection', {});
  }

  function splitInlineAncestorAtCaret(inlineEl) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return;
    // Create a range from caret to end of inlineEl, extract to tail, insert after inlineEl
    const afterRange = document.createRange();
    afterRange.setStart(range.startContainer, range.startOffset);
    afterRange.setEndAfter(inlineEl);
    const tail = afterRange.extractContents();
    inlineEl.after(tail);
    // Place caret between inlineEl and tail (i.e., outside formatting)
    const caret = document.createRange();
    caret.setStartAfter(inlineEl);
    caret.collapse(true);
    sel.removeAllRanges();
    sel.addRange(caret);
    editor.focus();
    // Remove empty inline elements
    if (!inlineEl.textContent) inlineEl.remove();
  }

  function getBlockAncestor(node) {
    if (!node) return null;
    let el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    while (el && el !== editor) {
      const tn = el.tagName;
      if (['P', 'DIV', 'H1', 'H2', 'H3', 'LI'].includes(tn)) return el;
      el = el.parentElement;
    }
    return editor;
  }

  function applyHeading(tag) {
    const range = getEditorSelectionRange();
    if (!range) return;
    dlog('applyHeading.begin', { tag });
    const markers = placeSelectionMarkers();
    const workRange = rangeBetweenMarkers(markers);
    const blocks = blocksInRange(workRange);
    const target = tag === 'P' ? 'P' : tag;
    if (blocks.length === 0) {
      // Inline-only selection: split by <br> or child blocks into multiple target blocks
      const frag = workRange.extractContents();
      const outFrag = document.createDocumentFragment();
      let cur = document.createElement(target);
      const push = () => { if (!cur.childNodes.length) cur.appendChild(document.createTextNode('\u200B')); outFrag.appendChild(cur); cur = document.createElement(target); };
      Array.from(frag.childNodes).forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR') { push(); }
        else if (node.nodeType === Node.ELEMENT_NODE && ['P','DIV','H1','H2','H3'].includes(node.tagName)) {
          if (cur.childNodes.length) push();
          const blk = document.createElement(target);
          while (node.firstChild) blk.appendChild(node.firstChild);
          outFrag.appendChild(blk);
        } else { cur.appendChild(node); }
      });
      if (cur.childNodes.length) outFrag.appendChild(cur);
      workRange.insertNode(outFrag);
    } else {
      blocks.forEach((blk) => {
        if (!blk || !blk.parentNode) return;
        if (blk.tagName === target) return; // already the right type
        const newBlock = document.createElement(target);
        while (blk.firstChild) newBlock.appendChild(blk.firstChild);
        blk.parentNode.replaceChild(newBlock, blk);
      });
    }
    restoreSelectionFromMarkers(markers);
    removeSelectionMarkers(markers);
    scheduleSave();
    updateCounts();
    updateToolbarStates();
    dlog('applyHeading.end', { tag });
  }

  function blocksInRange(range) {
    const seen = new Set();
    const list = [];
    try {
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          // Skip our selection markers
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node;
            if (el.hasAttribute && (el.hasAttribute('data-nb-sel-start') || el.hasAttribute('data-nb-sel-end'))) return NodeFilter.FILTER_REJECT;
          }
          return range.intersectsNode && range.intersectsNode(node)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        }
      });
      let n;
      while ((n = walker.nextNode())) {
        const blk = getBlockAncestor(n);
        if (blk && blk !== editor && !seen.has(blk)) { seen.add(blk); list.push(blk); }
      }
    } catch(_) {}
    return list;
  }

  function unwrapListsInRange(range) {
    try {
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_ELEMENT, {
        acceptNode(node) {
          if ((node.tagName === 'UL' || node.tagName === 'OL') && range.intersectsNode(node)) return NodeFilter.FILTER_ACCEPT;
          return NodeFilter.FILTER_SKIP;
        }
      });
      const lists = [];
      let n; while ((n = walker.nextNode())) lists.push(n);
      lists.forEach((list) => {
        // Replace each LI with P inside the list, then unwrap list
        const items = Array.from(list.children).filter(el => el.tagName === 'LI');
        items.forEach((li) => {
          const p = document.createElement('P');
          while (li.firstChild) p.appendChild(li.firstChild);
          list.replaceChild(p, li);
        });
        while (list.firstChild) list.parentNode.insertBefore(list.firstChild, list);
        list.parentNode.removeChild(list);
      });
    } catch(_) {}
  }

  function selectionHeadingTag() {
    const r = getEditorSelectionRange();
    if (!r) return null;
    const startBlock = getBlockAncestor(r.startContainer);
    const endBlock = getBlockAncestor(r.endContainer);
    const norm = (el) => (el && ['H1','H2','H3','P'].includes(el.tagName)) ? el.tagName : 'P';
    if (r.collapsed) return norm(startBlock);
    if (!startBlock || !endBlock || startBlock === editor || endBlock === editor) return null;
    let tag = null;
    let el = startBlock;
    while (el) {
      const t = norm(el);
      if (tag === null) tag = t; else if (tag !== t) return null; // mixed
      if (el === endBlock) break;
      el = el.nextElementSibling;
      if (!el || el.parentElement !== startBlock.parentElement) break;
    }
    return tag;
  }

  // Collect contiguous top-level blocks between markers (inclusive)
  function blocksBetweenMarkers(markers) {
    const startBlock = getBlockAncestor(markers.start);
    const endBlock = getBlockAncestor(markers.end);
    const out = [];
    const isBlock = (n) => n && n.nodeType === Node.ELEMENT_NODE && ['P','DIV','H1','H2','H3'].includes(n.tagName);
    if (!startBlock || startBlock === editor) return out;
    if (!endBlock || endBlock === editor) return [startBlock];
    let el = startBlock;
    while (el) {
      if (isBlock(el)) out.push(el);
      if (el === endBlock) break;
      el = el.nextElementSibling;
      if (!el || el.parentElement !== startBlock.parentElement) break;
    }
    return out;
  }

  function listItemAncestor(node) {
    let el = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
    while (el && el !== editor) {
      if (el.tagName === 'LI') return el;
      el = el.parentElement;
    }
    return null;
  }

  function selectionEntirelyInList() {
    const r = getEditorSelectionRange();
    if (!r) return false;
    if (r.collapsed) return !!listItemAncestor(r.startContainer);
    const startBlock = getBlockAncestor(r.startContainer);
    const endBlock = getBlockAncestor(r.endContainer);
    if (!startBlock || !endBlock || startBlock === editor || endBlock === editor) return false;
    let el = startBlock;
    while (el) {
      if (el.tagName !== 'LI') return false;
      if (el === endBlock) break;
      el = el.nextElementSibling;
      if (!el || el.parentElement !== startBlock.parentElement) break;
    }
    return true;
  }

  function toggleBulletedList() {
    const r = getEditorSelectionRange();
    if (!r) return;
    const markers = placeSelectionMarkers();
    const inList = selectionEntirelyInList();
    const workRange = rangeBetweenMarkers(markers);
    if (inList) {
      // unwrap li -> p
      const blocks = blocksBetweenMarkers(markers);
      blocks.forEach((li) => {
        if (li.tagName !== 'LI') return;
        const p = document.createElement('P');
        while (li.firstChild) p.appendChild(li.firstChild);
        const ul = li.parentElement;
        ul.replaceChild(p, li);
        // If UL now has no LI children, unwrap it
        if (!ul.querySelector('li')) {
          while (ul.firstChild) ul.parentNode.insertBefore(ul.firstChild, ul);
          ul.parentNode.removeChild(ul);
        }
      });
    } else {
      // wrap blocks -> ul>li (or split selection fragment by <br> if there are no blocks)
      const blocks = blocksBetweenMarkers(markers);
      if (blocks.length === 0) {
        // Selection has inline nodes only; split by BRs into list items
        const frag = workRange.extractContents();
        const ul = document.createElement('UL');
        let li = document.createElement('LI');
        const pushLiIfNeeded = () => {
          // avoid empty li at beginning
          if (li.childNodes.length === 0) li.appendChild(document.createTextNode('\u200B'));
          ul.appendChild(li);
          li = document.createElement('LI');
        };
        Array.from(frag.childNodes).forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR') {
            pushLiIfNeeded();
          } else if (node.nodeType === Node.ELEMENT_NODE && ['P','DIV','H1','H2','H3'].includes(node.tagName)) {
            // treat block as its own li
            if (li.childNodes.length) pushLiIfNeeded();
            const liBlock = document.createElement('LI');
            while (node.firstChild) liBlock.appendChild(node.firstChild);
            ul.appendChild(liBlock);
          } else {
            li.appendChild(node);
          }
        });
        if (li.childNodes.length) ul.appendChild(li);
        workRange.insertNode(ul);
      } else {
        const ul = document.createElement('UL');
        blocks.forEach((blk, idx) => {
          const li = document.createElement('LI');
          while (blk.firstChild) li.appendChild(blk.firstChild);
          if (idx === 0) {
            blk.parentNode.replaceChild(ul, blk);
          } else {
            blk.parentNode.removeChild(blk);
          }
          ul.appendChild(li);
        });
      }
    }
    restoreSelectionFromMarkers(markers);
    removeSelectionMarkers(markers);
    scheduleSave(); updateCounts(); updateToolbarStates();
  }

  // Toolbar events
  selectionToolbar.addEventListener('mousedown', (e) => {
    // Prevent losing selection when clicking toolbar
    e.preventDefault();
  });
  selectionToolbar.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const cmd = btn.getAttribute('data-cmd');
    const heading = btn.getAttribute('data-heading');
    const action = btn.getAttribute('data-action');
    const list = btn.getAttribute('data-list');
    if (cmd === 'bold') return toggleInline('STRONG', 'B');
    if (cmd === 'italic') return toggleInline('EM', 'I');
    if (cmd === 'underline') return toggleInline('U');
    if (list === 'ul') return toggleBulletedList();
    if (heading) return applyHeading(heading);
    if (action === 'clear-format') return clearFormatting();
  });
  // List features removed for now

  // Function to update word and character counts
  // Throttled counts
  function throttle(fn, wait) {
    let last = 0, t;
    return function(...args) {
      const now = Date.now();
      const remaining = wait - (now - last);
      if (remaining <= 0) {
        last = now;
        fn.apply(this, args);
      } else if (!t) {
        t = setTimeout(() => { last = Date.now(); t = null; fn.apply(this, args); }, remaining);
      }
    };
  }
  const updateCounts = throttle(() => {
    const text = editor.innerText.replace(/\u200B/g, '').trim();
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
    const characters = text.length;
    wordCount.textContent = `Words: ${words}`;
    charCount.textContent = `Characters: ${characters}`;
    // Placeholder visibility: mark empty if no visible characters
    editor.setAttribute('data-empty', characters === 0 ? 'true' : 'false');
    updatePlaceholderState();
  }, 100);

  function updatePlaceholderState() {
    const isEmpty = editor.getAttribute('data-empty') === 'true';
    const phText = editor.getAttribute('data-placeholder') || 'Write here ...';
    const first = editor.firstElementChild;
    if (isEmpty) {
      // Ensure exactly one empty paragraph with inline placeholder
      if (!first || first.tagName !== 'P' || !first.classList.contains('nb-empty')) {
        const p = document.createElement('P');
        p.classList.add('nb-empty');
        p.setAttribute('data-ph', phText);
        p.appendChild(document.createTextNode('\u200B'));
        editor.innerHTML = '';
        editor.appendChild(p);
        const sel = window.getSelection();
        const r = document.createRange();
        // Place caret after the ZWSP so typing/Enter behave naturally
        r.setStart(p.firstChild, Math.min(1, p.firstChild.nodeValue.length));
        r.collapse(true);
        sel.removeAllRanges(); sel.addRange(r);
      } else {
        first.setAttribute('data-ph', phText);
      }
    } else if (first && first.classList.contains('nb-empty')) {
      first.classList.remove('nb-empty');
      first.removeAttribute('data-ph');
    }
  }

  // Update counts initially
  updateCounts();

  // Ensure structural consistency is installed before any focus occurs
  editor.addEventListener('focus', ensureBaselineStructure);

  // Focus editor on load; place caret inside baseline paragraph when empty,
  // otherwise at the end of content
  focusEditorSmart();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleNormalize(); });

  // Show version badge so testers can confirm the loaded build
  try {
    const versionBadge = document.getElementById('versionBadge');
    const v = chrome && chrome.runtime && chrome.runtime.getManifest ? chrome.runtime.getManifest().version : '';
    if (versionBadge) versionBadge.textContent = v ? `v${v}` : 'v1.1.0';
  } catch (_) {}

  function isEditorVisiblyEmpty() {
    const text = (editor.innerText || '').replace(/\u200B/g, '').trim();
    return text.length === 0;
  }

  function focusEditorSmart() {
    editor.focus();
    const sel = window.getSelection();
    if (isEditorVisiblyEmpty()) {
      // Ensure we have a baseline <p> and place caret inside it
      ensureBaselineStructure();
      return;
    }
    const r = document.createRange();
    r.selectNodeContents(editor);
    r.collapse(false); // place at end when not empty
    sel.removeAllRanges();
    sel.addRange(r);
  }

  // Ensure caret lands at a visible position at the start of a block.
  // If the first text node begins with a zero-width space, position after it.
  function placeCaretAtVisibleStart(block) {
    const sel = window.getSelection();
    const r = document.createRange();
    let node = block;
    // Find first descendant (prefer text)
    while (node && node.firstChild) node = node.firstChild;
    if (!node || node.nodeType !== Node.TEXT_NODE) {
      const t = document.createTextNode('\u200B');
      block.insertBefore(t, block.firstChild);
      node = t;
    }
    const text = node.nodeValue || '';
    const offset = text.charCodeAt(0) === 0x200B ? 1 : 0;
    r.setStart(node, Math.min(offset, text.length));
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  }

  function ensureBaselineStructure() {
    if (editor.childNodes.length === 0 || isEditorVisiblyEmpty()) {
      // Create a single empty paragraph to start with
      const p = document.createElement('P');
      p.classList.add('nb-empty');
      p.setAttribute('data-ph', editor.getAttribute('data-placeholder') || 'Write here ...');
      p.appendChild(document.createTextNode('\u200B'));
      editor.innerHTML = '';
      editor.appendChild(p);
      const sel = window.getSelection();
      const r = document.createRange();
      // Place caret after the ZWSP so caret is visible
      r.setStart(p.firstChild, Math.min(1, p.firstChild.nodeValue.length));
      r.collapse(true);
      sel.removeAllRanges(); sel.addRange(r);
      editor.setAttribute('data-empty','true');
      return;
    }
    scheduleNormalize();
  }

  let normalizeTimer = null;
  function scheduleNormalize() {
    if (normalizeTimer) {
      if (typeof cancelIdleCallback === 'function') cancelIdleCallback(normalizeTimer);
      else clearTimeout(normalizeTimer);
    }
    const runner = () => { try { normalizeEditorStructure(); } catch(_) {} normalizeTimer = null; };
    if ('requestIdleCallback' in window) normalizeTimer = requestIdleCallback(runner, { timeout: 200 });
    else normalizeTimer = setTimeout(runner, 100);
  }

  function normalizeEditorStructure() {
    // Ensure #editor contains only block elements at the top level
    const blockTags = new Set(['P','H1','H2','H3','UL','OL']);
    let needsWork = false;
    editor.childNodes.forEach && editor.childNodes.forEach(() => {}); // noop for legacy
    const children = Array.from(editor.childNodes);
    for (const node of children) {
      if (node.nodeType === Node.TEXT_NODE && node.nodeValue.replace(/\u200B/g,'').trim()) { needsWork = true; break; }
      if (node.nodeType === Node.ELEMENT_NODE) {
        const tn = node.tagName;
        if (tn === 'BR' || tn === 'DIV' || !blockTags.has(tn)) { needsWork = true; break; }
      }
    }
    if (!needsWork) return;
    const markers = placeSelectionMarkers();
    const newChildren = [];
    let currentP = null;
    function ensureP() { if (!currentP) { currentP = document.createElement('P'); newChildren.push(currentP); } }
    for (const node of Array.from(editor.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        const val = node.nodeValue;
        if (!val || !val.replace(/\u200B/g,'').trim()) { node.parentNode.removeChild(node); continue; }
        ensureP(); currentP.appendChild(node);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tn = node.tagName;
        if (tn === 'BR') {
          ensureP(); currentP = null; node.remove();
        } else if (tn === 'DIV') {
          // Convert div → p
          const p = document.createElement('P');
          while (node.firstChild) p.appendChild(node.firstChild);
          node.parentNode.replaceChild(p, node);
          newChildren.push(p);
        } else if (['P','H1','H2','H3','UL','OL'].includes(tn)) {
          newChildren.push(node);
          currentP = null;
        } else {
          // Inline element at root → wrap into P
          ensureP(); currentP.appendChild(node);
        }
      }
    }
    // If we built a new list of children, ensure they are attached in order
    if (newChildren.length) {
      const frag = document.createDocumentFragment();
      newChildren.forEach(n => frag.appendChild(n));
      editor.innerHTML = '';
      editor.appendChild(frag);
    }
    // Safety: flatten any nested paragraphs accidentally introduced by browser ops
    try {
      const tops = Array.from(editor.children);
      for (const top of tops) {
        if (top.tagName !== 'P') continue;
        const nested = top.querySelectorAll('p');
        nested.forEach((np) => {
          const newP = document.createElement('P');
          while (np.firstChild) newP.appendChild(np.firstChild);
          top.parentNode.insertBefore(newP, top.nextSibling);
          np.remove();
        });
      }
    } catch(_) {}
    restoreSelectionFromMarkers(markers);
    removeSelectionMarkers(markers);
    updatePlaceholderState();
  }

  // Debounced saving to reduce churn and avoid selection resets
  let saveTimer = null;
  let lastLocalSaveAt = 0;
  let lastSavedHtml = '';
  let lastInputAt = 0;

  // Save content to local storage
  function saveContent() {
    const content = editor.innerHTML;
    lastLocalSaveAt = Date.now();
    lastSavedHtml = content;
    try {
      chrome.storage.local.set({ noteContent: content, noteContentUpdatedBy: clientId, noteContentUpdatedAt: lastLocalSaveAt }, () => {
        if (chrome.runtime && chrome.runtime.lastError) {
          // swallow; could log to console
        }
      });
    } catch (_) {}
  }
  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveContent();
      saveTimer = null;
    }, 500);
  }

  // Save (debounced) and count on input
  editor.addEventListener('input', () => {
    updateCounts();
    lastInputAt = Date.now();
    scheduleSave();
    // Normalize immediately to prevent transient spacing glitches
    try { normalizeEditorStructure(); } catch(_) {}
  });

  // Load content from local storage
  try { chrome.storage.local.get(['noteContent'], (result) => {
    if (result.noteContent !== undefined) {
      editor.innerHTML = sanitizeHtml(result.noteContent);
      updateCounts();
    }
  }); } catch (_) {}

  // React to external updates robustly (avoid clobbering caret mid-typing)
  let pendingRemoteHtml = null;
  let pendingApplyTimer = null;
  function applyPendingRemoteIfIdle() {
    if (!pendingRemoteHtml) return;
    const now = Date.now();
    if (document.activeElement === editor && now - lastInputAt < 800) {
      if (pendingApplyTimer) clearTimeout(pendingApplyTimer);
      pendingApplyTimer = setTimeout(applyPendingRemoteIfIdle, 400);
      return;
    }
    if (pendingRemoteHtml !== editor.innerHTML) {
      editor.innerHTML = sanitizeHtml(pendingRemoteHtml);
      updateCounts();
    }
    pendingRemoteHtml = null;
    pendingApplyTimer = null;
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    // Ignore our own updates when detectable
    if (changes.noteContentUpdatedBy && changes.noteContentUpdatedBy.newValue === clientId) return;
    // Ignore events older or equal to our last local save
    if (changes.noteContentUpdatedAt && typeof changes.noteContentUpdatedAt.newValue === 'number') {
      if (changes.noteContentUpdatedAt.newValue <= lastLocalSaveAt) return;
    }
    if (changes.noteContent) {
      const newVal = changes.noteContent.newValue || '';
      if (newVal === editor.innerHTML) return;
      // Defer applying while user is typing to preserve caret
      if (document.activeElement === editor && Date.now() - lastInputAt < 800) {
        pendingRemoteHtml = newVal;
        applyPendingRemoteIfIdle();
        return;
      }
      editor.innerHTML = sanitizeHtml(newVal);
      updateCounts();
    }
  });

  editor.addEventListener('blur', () => {
    if (pendingRemoteHtml) applyPendingRemoteIfIdle();
  });

  // No checkbox list handling (feature disabled)

  // Preserve formatting on paste (allow browser to insert HTML). No interception.
  // Sanitization happens on load; we also expand allowed tags to include UL/LI etc.

  // Prevent dropping rich HTML/files; only allow plain text
  editor.addEventListener('dragover', (e) => { e.preventDefault(); });
  editor.addEventListener('drop', (e) => {
    e.preventDefault();
    const text = e.dataTransfer && e.dataTransfer.getData('text/plain');
    if (text) insertTextAtSelection(text);
  });

  // Selection toolbar visibility and positioning
  function selectionWithinEditor() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return false;
    const anchorNode = sel.anchorNode;
    const focusNode = sel.focusNode;
    const isInEditor = editor.contains(anchorNode) && editor.contains(focusNode);
    return isInEditor;
  }
  function showSelectionToolbar() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return hideSelectionToolbar();
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return hideSelectionToolbar();

    selectionToolbar.style.display = 'flex';
    const toolbarRect = selectionToolbar.getBoundingClientRect();
    let top = window.scrollY + rect.top - toolbarRect.height - 8;
    let left = window.scrollX + rect.left + (rect.width / 2) - (toolbarRect.width / 2);
    if (top < 0) {
      top = window.scrollY + rect.bottom + 8;
    }
    left = Math.max(8 + window.scrollX, Math.min(left, window.scrollX + window.innerWidth - toolbarRect.width - 8));
    selectionToolbar.style.top = `${top}px`;
    selectionToolbar.style.left = `${left}px`;
    updateToolbarStates();
  }
  function hideSelectionToolbar() {
    selectionToolbar.style.display = 'none';
  }
  function updateToolbarStates() {
    try {
      const selRange = getEditorSelectionRange();
      const sel = window.getSelection();
      selectionToolbar.querySelectorAll('[data-cmd]').forEach((btn) => {
        const cmd = btn.getAttribute('data-cmd');
        let active = false;
        if (cmd === 'bold') {
          const tags = ['STRONG','B'];
          active = selRange && (selRange.collapsed
                    ? nodeHasAncestorTag(sel.anchorNode, tags)
                    : selectionFullyWithinTags(selRange, tags));
        } else if (cmd === 'italic') {
          const tags = ['EM','I'];
          active = selRange && (selRange.collapsed
                    ? nodeHasAncestorTag(sel.anchorNode, tags)
                    : selectionFullyWithinTags(selRange, tags));
        } else if (cmd === 'underline') {
          const tags = ['U'];
          active = selRange && (selRange.collapsed
                    ? nodeHasAncestorTag(sel.anchorNode, tags)
                    : selectionFullyWithinTags(selRange, tags));
        }
        btn.classList.toggle('active', !!active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      // Heading states: active only if the entire selection shares the same block tag
      const hTag = selectionHeadingTag();
      selectionToolbar.querySelectorAll('[data-heading]').forEach((btn) => {
        const tag = btn.getAttribute('data-heading');
        const active = !!hTag && hTag === tag;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      // List state: active when selection is entirely inside list items
      const inList = selectionEntirelyInList();
      selectionToolbar.querySelectorAll('[data-list]')
        .forEach((btn) => {
          btn.classList.toggle('active', inList);
          btn.setAttribute('aria-pressed', inList ? 'true' : 'false');
        });
    } catch (_) {}
  }

  // Insert plain text at current selection
  function insertTextAtSelection(text) {
    const range = getEditorSelectionRange();
    if (!range) return;
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    // Move caret to end of inserted text
    const sel = window.getSelection();
    const after = document.createRange();
    after.setStart(node, node.nodeValue.length);
    after.collapse(true);
    sel.removeAllRanges();
    sel.addRange(after);
    scheduleSave();
    updateCounts();
  }

  // Basic sanitizer for stored HTML
  function sanitizeHtml(html) {
    try {
      const tpl = document.createElement('template');
      tpl.innerHTML = html || '';
      const allowed = new Set(['P','DIV','SPAN','STRONG','EM','U','B','I','H1','H2','H3','BR','UL','LI','OL','A','CODE','PRE','BLOCKQUOTE','IMG','FIGURE','FIGCAPTION','PICTURE','SOURCE']);
      (function walk(node) {
        const children = Array.from(node.childNodes);
        for (const child of children) {
          if (child.nodeType === Node.ELEMENT_NODE) {
            const tag = child.tagName;
            if (!allowed.has(tag)) {
              // Replace disallowed element with its text content
              const frag = document.createDocumentFragment();
              while (child.firstChild) frag.appendChild(child.firstChild);
              child.replaceWith(frag);
              continue;
            }
            // Remove dangerous attributes
            if (tag === 'IMG') {
              // Keep safe attributes and ensure src is absolute http(s)/data/blob
              const keep = new Set(['src','alt','title','width','height','srcset','sizes','loading','decoding','referrerpolicy']);
              Array.from(child.attributes).forEach(attr => {
                const n = attr.name.toLowerCase();
                if (!keep.has(n)) child.removeAttribute(attr.name);
              });
              const src = child.getAttribute('src') || '';
              try {
                const u = new URL(src, location.href);
                if (!/^https?:$/.test(u.protocol) && u.protocol !== 'data:' && u.protocol !== 'blob:') {
                  child.remove();
                } else {
                  child.setAttribute('src', u.href);
                }
              } catch(_) { child.remove(); }
              if (child.hasAttribute('srcset')) {
                const srcset = child.getAttribute('srcset');
                if (srcset) {
                  const parts = srcset.split(',').map(s => s.trim()).filter(Boolean).map(entry => {
                    const m = entry.split(/\s+/);
                    const url = m[0];
                    try { const u = new URL(url, location.href); return [u.href, ...m.slice(1)].join(' '); }
                    catch { return ''; }
                  }).filter(Boolean);
                  child.setAttribute('srcset', parts.join(', '));
                }
              }
            } else if (tag === 'A') {
              const keep = new Set(['href','title','target','rel']);
              Array.from(child.attributes).forEach(attr => { if (!keep.has(attr.name.toLowerCase())) child.removeAttribute(attr.name); });
              const href = child.getAttribute('href') || '';
              try {
                const u = new URL(href, location.href);
                child.setAttribute('href', u.href);
                // security best practice for new tabs
                if (!child.getAttribute('rel')) child.setAttribute('rel','noopener noreferrer');
              } catch(_) { child.removeAttribute('href'); }
            } else {
              Array.from(child.attributes).forEach(attr => {
                const n = attr.name.toLowerCase();
                if (n.startsWith('on')) child.removeAttribute(attr.name);
              });
            }
            walk(child);
          } else if (child.nodeType === Node.COMMENT_NODE) {
            child.remove();
          }
        }
      })(tpl.content);
      return tpl.innerHTML;
    } catch (_) {
      return '';
    }
  }
  // Debounce toolbar repositioning
  const debouncedSelectionChange = throttle(() => {
    if (selectionWithinEditor()) showSelectionToolbar(); else hideSelectionToolbar();
  }, 50);
  document.addEventListener('selectionchange', debouncedSelectionChange);
  window.addEventListener('scroll', hideSelectionToolbar, true);
  window.addEventListener('resize', hideSelectionToolbar);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideSelectionToolbar();
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Keep baseline paragraph: prevent deleting the only block at caret start
    if (e.key === 'Backspace' && document.activeElement === editor) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        const r = sel.getRangeAt(0);
        if (r.collapsed) {
          const first = editor.firstElementChild;
          const blk = getBlockAncestor(r.startContainer);
          if (first && blk === first && (first.tagName === 'P' || first.tagName === 'DIV') && editor.children.length === 1) {
            const start = document.createRange(); start.selectNodeContents(first); start.collapse(true);
            if (r.compareBoundaryPoints(Range.START_TO_START, start) === 0) { e.preventDefault(); return; }
          }
        }
      }
    }
    // Toggle on-screen debug overlay: Ctrl+Alt+D
    if ((e.ctrlKey || e.metaKey) && e.altKey && !e.shiftKey && (e.key==='d' || e.key==='D')) {
      e.preventDefault(); toggleDebug(); return;
    }
    // Normalize Enter to insert a new block consistently
    if (e.key === 'Enter' && !e.shiftKey && document.activeElement === editor) {
      if (isComposing) return; // allow IME to commit
      e.preventDefault();
      // Exit inline formatting so the next line starts plain
      const inlineTags = ['STRONG','B','EM','I','U'];
      let anc;
      while ((anc = findNearestInlineAncestor(inlineTags))) {
        splitInlineAncestorAtCaret(anc);
      }
      const inLi = !!(window.getSelection() && listItemAncestor(window.getSelection().anchorNode));
      if (inLi) {
        // Let the browser continue the list reliably
        try { if (document.execCommand) document.execCommand('insertParagraph'); } catch(_) {}
      } else {
        // Prefer native paragraph insertion for robust caret movement
        let usedNative = false;
        try {
          if (document.execCommand) {
            document.execCommand('insertParagraph');
            usedNative = true;
          }
        } catch(_) { usedNative = false; }
        if (!usedNative) {
          // Fallback: manual split
          insertParagraphBreak();
        } else {
          // After native insert, coerce DIV→P if needed and ensure caret is visible
          normalizeAfterEnter();
        }
      }
      scheduleSave(); updateCounts(); updateToolbarStates();
      return;
    }
    // Convert '- ' at block start into a bullet
    if (e.key === ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const r = getEditorSelectionRange();
      if (r && r.collapsed) {
        const blk = getBlockAncestor(r.startContainer);
        if (blk && blk !== editor && blk.tagName !== 'LI') {
          const t = document.createRange();
          t.setStart(blk, 0); t.setEnd(r.startContainer, r.startOffset);
          const prefix = (t.cloneContents().textContent || '').replace(/\u200B/g,'');
          if (/^\s*-\s?$/.test(prefix)) {
            e.preventDefault();
            t.deleteContents();
            const ul = document.createElement('UL');
            const li = document.createElement('LI');
            while (blk.firstChild) li.appendChild(blk.firstChild);
            ul.appendChild(li);
            blk.parentNode.replaceChild(ul, blk);
            const sel = window.getSelection();
            const nr = document.createRange();
            if (li.firstChild && li.firstChild.nodeType === Node.TEXT_NODE) {
              const v = li.firstChild.nodeValue || '';
              const off = v.charCodeAt(0) === 0x200B ? 1 : 0;
              nr.setStart(li.firstChild, Math.min(off, v.length));
            } else {
              nr.setStart(li, 0);
            }
            nr.collapse(true);
            sel.removeAllRanges(); sel.addRange(nr);
            scheduleSave(); updateCounts(); updateToolbarStates();
            return;
          }
        }
      }
    }
    // Backspace on empty bullet exits list
    if (e.key === 'Backspace') {
      const sel = window.getSelection();
      const li = sel && listItemAncestor(sel.anchorNode);
      if (li) {
        const text = (li.innerText || '').replace(/\u200B/g,'').trim();
        if (text.length === 0) {
          e.preventDefault();
          const ul = li.parentElement;
          const prev = li.previousElementSibling;
          ul.removeChild(li);
          if (!ul.querySelector('li')) {
            const p = document.createElement('P');
            p.appendChild(document.createTextNode('\u200B'));
            ul.parentNode.replaceChild(p, ul);
            placeCaretAtVisibleStart(p);
          } else if (prev) {
            const r2 = document.createRange();
            const endNode = prev.lastChild || prev; const len = endNode.nodeType === Node.TEXT_NODE ? endNode.nodeValue.length : endNode.childNodes.length;
            r2.setStart(endNode, len); r2.collapse(true);
            sel.removeAllRanges(); sel.addRange(r2);
          }
          scheduleSave(); updateCounts(); updateToolbarStates();
          return;
        }
      }
    }
    const plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
    const isMac = /mac/i.test(plat);
    const meta = e.metaKey;
    const ctrl = e.ctrlKey;
    const alt = e.altKey;
    const shift = e.shiftKey;
    if (document.activeElement !== editor) return;

    // Bold/Italic/Underline: Mac=Cmd, Others=Ctrl
    const primary = isMac ? meta : ctrl;
    if (primary && !alt && !shift && (e.key === 'b' || e.key === 'B')) { e.preventDefault(); toggleInline('STRONG','B'); return; }
    if (primary && !alt && !shift && (e.key === 'i' || e.key === 'I')) { e.preventDefault(); toggleInline('EM','I'); return; }
    if (primary && !alt && !shift && (e.key === 'u' || e.key === 'U')) { e.preventDefault(); toggleInline('U'); return; }

    // Headings: Mac=Control+Option, Others=Ctrl+Alt
    const isDigit = (d) => e.key === String(d) || e.code === `Digit${d}`;
    const headingsCombo = (ctrl && alt && !shift) || (isMac && meta && alt && !shift);
    if (headingsCombo) {
      if (isDigit(1)) { e.preventDefault(); applyHeading('H1'); return; }
      if (isDigit(2)) { e.preventDefault(); applyHeading('H2'); return; }
      if (isDigit(3)) { e.preventDefault(); applyHeading('H3'); return; }
      if (isDigit(0)) { e.preventDefault(); applyHeading('P'); return; }
    }
  });
  // Enter behavior handled above: we insert <p> consistently

  // Shortcuts overlay handlers
  shortcutsBtn.addEventListener('click', () => {
    shortcutsOverlay.style.display = 'flex';
    openShortcutsOverlay();
  });
  closeShortcuts.addEventListener('click', () => {
    closeShortcutsOverlay();
  });
  shortcutsOverlay.addEventListener('click', (e) => {
    if (e.target === shortcutsOverlay) closeShortcutsOverlay();
  });
  function openShortcutsOverlay() {
    const focusables = shortcutsOverlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusables.length) focusables[0].focus();
    document.addEventListener('keydown', handleOverlayKeydown);
  }
  function closeShortcutsOverlay() {
    shortcutsOverlay.style.display = 'none';
    document.removeEventListener('keydown', handleOverlayKeydown);
    shortcutsBtn.focus();
  }
  function handleOverlayKeydown(e) {
    if (e.key === 'Escape') closeShortcutsOverlay();
    if (e.key === 'Tab') {
      const focusables = Array.from(shortcutsOverlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'));
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  // Insert a paragraph break at the caret, splitting the current block
  function insertParagraphBreak() {
    const range = getEditorSelectionRange();
    if (!range) return;
    dlog('insertParagraphBreak.begin', {});
    // If selection spans content, remove it first to create a single caret
    if (!range.collapsed) {
      range.deleteContents();
    }
    let block = getBlockAncestor(range.startContainer);
    const inheritTag = (blk) => (blk && blk !== editor && blk.tagName ? blk.tagName : 'P');
    const newBlock = document.createElement(inheritTag(block));
    // If no block found (should be rare), fall back to first block; if none, create one
    if (!block || block === editor) block = editor.firstElementChild;
    if (!block || block === editor) {
      // No block exists yet; create one and position caret
      const p = document.createElement('P');
      p.appendChild(document.createTextNode('\u200B'));
      editor.appendChild(p);
      placeCaretAtVisibleStart(p);
      return;
    } else {
      // Split the current block into two blocks of the same tag
      const tail = document.createRange();
      tail.setStart(range.startContainer, range.startOffset);
      // Extract only the remainder of the current block's contents,
      // not a cloned <p> wrapper (which would create nested paragraphs).
      tail.setEnd(block, block.childNodes.length);
      const frag = tail.extractContents();
      if (frag && frag.childNodes && frag.childNodes.length) {
        while (frag.firstChild) newBlock.appendChild(frag.firstChild);
      } else {
        newBlock.appendChild(document.createTextNode('\u200B'));
      }
      block.parentNode.insertBefore(newBlock, block.nextSibling);
    }
    placeCaretAtVisibleStart(newBlock);
    editor.focus();
    dlog('insertParagraphBreak.end', {});
  }

  // After native insertParagraph, the browser may create a <div>. Normalize it
  // to <p> and ensure the caret sits at a visible position in the new block.
  function normalizeAfterEnter() {
    const r = getEditorSelectionRange();
    if (!r || !r.collapsed) return;
    let blk = getBlockAncestor(r.startContainer);
    if (!blk || blk === editor) return;
    if (blk.tagName === 'DIV') {
      const m = placeSelectionMarkers();
      blk = convertBlockTag(blk, 'P');
      restoreSelectionFromMarkers(m);
      removeSelectionMarkers(m);
    }
    // Ensure layout exists (empty blocks might render with zero height)
    if (blk && blk.firstChild == null) blk.appendChild(document.createElement('BR'));
    // Make sure caret is not before a ZWSP
    placeCaretAtVisibleStart(blk);
  }
});

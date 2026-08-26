'use strict';

/**
 * Click-to-edit for the local dev server. Not deployed: see .assetsignore.
 *
 * Injected into every page by dev-server.js. Toggling edit mode makes the text
 * blocks editable in place; saving posts each changed block back to the source
 * file it came from.
 *
 * Each block is matched in the source by its exact original markup, so an edit
 * lands without reformatting the rest of the file. That is also why the original
 * innerHTML is captured once at load and only replaced after a confirmed save:
 * it is the lookup key, not just a dirty-check.
 *
 * Unsaved work is mirrored to localStorage on every keystroke and offered back
 * on reload, because a closed tab used to mean a lost edit.
 */
(function () {
  const PAGE = document.currentScript ? document.currentScript.dataset.page : location.pathname;
  const DRAFT_KEY = '__site_draft:' + PAGE;

  // Leaf text blocks only. Structured parents such as li.blog-item are left alone
  // so their child span and anchor keep their own identity when edited.
  const SELECTORS = [
    'main > section > p',
    'main > p',
    'main > h2',
    'main > h3',
    'h1.page-title',
    '.post-meta',
    'article p',
    'article h2',
    'article h3',
    'article li',
    '.project-name',
    '.project-desc',
    '.project-tag',
    '.blog-date',
    '.blog-link',
    '.log-date',
    '.log-detail',
    '.photo-caption > span',
    '.rocket-table td',
    '.rocket-table th',
    '.list-plain > li',
  ].join(', ');

  const originals = new Map();
  let editing = false;

  function targets() {
    return Array.from(document.querySelectorAll(SELECTORS));
  }

  /* ---------- serialisation ----------
   * contenteditable is allowed to be rich now, because links need real <a>
   * elements. The trade is that browsers also inject <div>, <font> and inline
   * styles, so what gets written back is rebuilt from an allowlist rather than
   * taken from innerHTML directly. Attributes are emitted in their existing
   * order so untouched markup round-trips byte-for-byte and the source lookup
   * still matches.
   */
  const ALLOWED = {
    A: ['class', 'href', 'target', 'rel', 'title'],
    STRONG: ['class'],
    EM: ['class'],
    CODE: ['class'],
    SPAN: ['class'],
    BR: [],
  };
  const REMAP = { B: 'STRONG', I: 'EM' };

  function escapeText(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/ /g, '&nbsp;');
  }

  function escapeAttr(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }

  function walk(node, out) {
    node.childNodes.forEach(child => {
      if (child.nodeType === Node.TEXT_NODE) {
        out.push(escapeText(child.nodeValue));
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;

      const tag = REMAP[child.tagName] || child.tagName;
      const allowed = ALLOWED[tag];

      // Not on the list: drop the wrapper, keep the words.
      if (!allowed) {
        walk(child, out);
        return;
      }
      if (tag === 'BR') {
        out.push('<br />');
        return;
      }

      const attrs = [];
      Array.from(child.attributes).forEach(attr => {
        if (allowed.includes(attr.name)) attrs.push(` ${attr.name}="${escapeAttr(attr.value)}"`);
      });

      const name = tag.toLowerCase();
      out.push(`<${name}${attrs.join('')}>`);
      walk(child, out);
      out.push(`</${name}>`);
    });
  }

  function serialize(el) {
    const out = [];
    walk(el, out);
    return out.join('');
  }

  function changed() {
    return targets().filter(el => originals.has(el) && serialize(el) !== originals.get(el));
  }

  /* ---------- draft persistence ---------- */

  function saveDraft() {
    const dirty = changed();
    if (dirty.length === 0) {
      localStorage.removeItem(DRAFT_KEY);
      return;
    }
    const all = targets();
    const entries = dirty.map(el => ({
      i: all.indexOf(el),
      // Kept so a draft written against older markup is not pasted onto a
      // block that has since changed underneath it.
      key: originals.get(el).slice(0, 80),
      html: serialize(el),
    }));
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ at: Date.now(), entries }));
    } catch (err) {
      /* storage full or disabled: the in-page copy is still live */
    }
  }

  function readDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function restoreDraft(draft) {
    const all = targets();
    let restored = 0;
    draft.entries.forEach(entry => {
      const el = all[entry.i];
      if (!el || !originals.has(el)) return;
      if (originals.get(el).slice(0, 80) !== entry.key) return;
      el.innerHTML = entry.html;
      restored++;
    });
    return restored;
  }

  /* ---------- paste ---------- */

  function onPaste(event) {
    event.preventDefault();
    const text = (event.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  }

  function onInput() {
    refreshSaveState();
    saveDraft();
  }

  /* ---------- styles ---------- */

  const style = document.createElement('style');
  style.textContent = `
    .__edit-on [contenteditable] {
      outline: 1px dashed rgba(0, 0, 0, 0.25);
      outline-offset: 3px;
      border-radius: 2px;
    }
    .__edit-on [contenteditable]:hover { outline-color: rgba(0, 0, 0, 0.45); }
    .__edit-on [contenteditable]:focus {
      outline: 2px solid #2563eb;
      outline-offset: 3px;
    }
    .__edit-bar {
      position: fixed; bottom: 16px; right: 16px; z-index: 99999;
      display: flex; align-items: center; gap: 8px;
      padding: 8px 10px; border-radius: 8px;
      background: #111; color: #fff;
      font: 500 13px/1.2 ui-monospace, "JetBrains Mono", Menlo, monospace;
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);
    }
    .__edit-bar button, .__edit-bar a.__nav {
      font: inherit; color: #fff; background: #333; border: 0;
      padding: 6px 10px; border-radius: 5px; cursor: pointer; text-decoration: none;
    }
    .__edit-bar button:hover, .__edit-bar a.__nav:hover { background: #444; }
    .__edit-bar button[disabled] { opacity: 0.4; cursor: default; }
    .__edit-bar .__save { background: #2563eb; }
    .__edit-bar .__save:hover { background: #1d4ed8; }
    .__edit-bar .__save.__dirty { background: #dc2626; }
    .__edit-bar .__save.__dirty:hover { background: #b91c1c; }
    .__edit-status { max-width: 300px; opacity: 0.85; font-weight: 400; }

    .__link-pop {
      position: absolute; z-index: 100000;
      display: none; gap: 6px; align-items: center;
      padding: 8px; border-radius: 8px;
      background: #111; color: #fff;
      font: 400 13px/1.2 ui-monospace, "JetBrains Mono", Menlo, monospace;
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.3);
    }
    .__link-pop.__open { display: flex; }
    .__link-pop input {
      font: inherit; color: #fff; background: #000; border: 1px solid #444;
      border-radius: 4px; padding: 6px 8px; width: 280px;
    }
    .__link-pop input:focus { outline: none; border-color: #2563eb; }
    .__link-pop button {
      font: inherit; color: #fff; background: #333; border: 0;
      padding: 6px 9px; border-radius: 4px; cursor: pointer;
    }
    .__link-pop button:hover { background: #444; }
    .__link-pop .__apply { background: #2563eb; }
    .__link-pop .__apply:hover { background: #1d4ed8; }

    .__draft-bar {
      position: fixed; top: 0; left: 0; right: 0; z-index: 100001;
      display: none; gap: 12px; align-items: center; justify-content: center;
      padding: 10px 14px; background: #b45309; color: #fff;
      font: 500 13px/1.2 ui-monospace, "JetBrains Mono", Menlo, monospace;
    }
    .__draft-bar.__open { display: flex; }
    .__draft-bar button {
      font: inherit; color: #fff; background: rgba(0,0,0,0.3); border: 0;
      padding: 6px 10px; border-radius: 4px; cursor: pointer;
    }
    .__draft-bar button:hover { background: rgba(0,0,0,0.5); }
  `;

  /* ---------- toolbar ---------- */

  const bar = document.createElement('div');
  bar.className = '__edit-bar';
  bar.innerHTML = `
    <button type="button" class="__toggle">edit</button>
    <button type="button" class="__link" disabled title="Add or edit a link (Cmd+K)">link</button>
    <button type="button" class="__save" disabled>save</button>
    <a class="__nav" href="/admin">new post</a>
    <span class="__edit-status"></span>
  `;

  const toggleBtn = bar.querySelector('.__toggle');
  const linkBtn = bar.querySelector('.__link');
  const saveBtn = bar.querySelector('.__save');
  const status = bar.querySelector('.__edit-status');

  const pop = document.createElement('div');
  pop.className = '__link-pop';
  pop.innerHTML = `
    <input type="text" class="__url" placeholder="https://example.com or blog.html" />
    <button type="button" class="__apply">apply</button>
    <button type="button" class="__unlink">remove</button>
  `;
  const urlInput = pop.querySelector('.__url');

  const draftBar = document.createElement('div');
  draftBar.className = '__draft-bar';
  draftBar.innerHTML = `
    <span class="__draft-msg"></span>
    <button type="button" class="__draft-restore">restore them</button>
    <button type="button" class="__draft-discard">discard</button>
  `;

  function setStatus(message, isError) {
    status.textContent = message || '';
    status.style.color = isError ? '#fca5a5' : '#fff';
  }

  function refreshSaveState() {
    const count = changed().length;
    saveBtn.disabled = count === 0;
    saveBtn.textContent = count > 0 ? `save (${count})` : 'save';
    saveBtn.classList.toggle('__dirty', count > 0);
    linkBtn.disabled = !editing;
  }

  // Leaving edit mode with pending changes used to drop them on the floor:
  // "done" reads as "commit this", so it now writes before it exits, and stays
  // open if that write did not land.
  async function setEditing(on) {
    if (!on && changed().length > 0) {
      const saved = await save();
      if (!saved) return;
    }

    editing = on;
    document.body.classList.toggle('__edit-on', on);
    toggleBtn.textContent = on ? 'done' : 'edit';

    targets().forEach(el => {
      if (on) {
        el.setAttribute('contenteditable', 'true');
        el.addEventListener('paste', onPaste);
        el.addEventListener('input', onInput);
      } else {
        el.removeAttribute('contenteditable');
        el.removeEventListener('paste', onPaste);
        el.removeEventListener('input', onInput);
      }
    });

    if (!on) hidePopover();
    setStatus(on ? 'click text to edit, select then Cmd+K to link' : '');
    refreshSaveState();
  }

  /* ---------- links ---------- */

  function editableAncestor(node) {
    let el = node && node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
    while (el && el !== document.body) {
      if (el.hasAttribute && el.hasAttribute('contenteditable')) return el;
      el = el.parentNode;
    }
    return null;
  }

  function anchorAtCursor() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    let el = sel.getRangeAt(0).startContainer;
    if (el.nodeType === Node.TEXT_NODE) el = el.parentNode;
    while (el && el.hasAttribute && !el.hasAttribute('contenteditable')) {
      if (el.tagName === 'A') return el;
      el = el.parentNode;
    }
    return null;
  }

  // A bare "example.com" is almost certainly meant as external. Anything with a
  // scheme, a leading slash, a mailto or a local .html path is left alone.
  function normalizeUrl(raw) {
    const url = raw.trim();
    if (!url) return '';
    if (/^([a-z][a-z0-9+.-]*:|\/|#|\.)/i.test(url)) return url;
    if (/\.html?($|[?#])/i.test(url)) return url;
    return 'https://' + url;
  }

  function isExternal(url) {
    return /^https?:\/\//i.test(url) && !url.startsWith(location.origin);
  }

  let savedRange = null;

  function showPopover() {
    if (!editing) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      setStatus('put the cursor in some text first', true);
      return;
    }

    const range = sel.getRangeAt(0);
    const host = editableAncestor(range.commonAncestorContainer);
    if (!host) {
      setStatus('select text inside an editable block', true);
      return;
    }

    const existing = anchorAtCursor();
    if (range.collapsed && !existing) {
      setStatus('select the words you want to link', true);
      return;
    }

    savedRange = range.cloneRange();
    urlInput.value = existing ? existing.getAttribute('href') || '' : '';

    const rect = range.getBoundingClientRect();
    pop.classList.add('__open');
    const top = window.scrollY + rect.bottom + 8;
    const left = Math.max(8, Math.min(window.scrollX + rect.left, window.scrollX + window.innerWidth - pop.offsetWidth - 8));
    pop.style.top = `${top}px`;
    pop.style.left = `${left}px`;

    urlInput.focus();
    urlInput.select();
    setStatus('');
  }

  function hidePopover() {
    pop.classList.remove('__open');
    savedRange = null;
  }

  function restoreSelection() {
    if (!savedRange) return null;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
    return savedRange;
  }

  function applyLink() {
    const url = normalizeUrl(urlInput.value);
    if (!url) {
      setStatus('enter a URL, or press remove', true);
      return;
    }

    const range = restoreSelection();
    if (!range) return hidePopover();

    const host = editableAncestor(range.commonAncestorContainer);
    const existing = anchorAtCursor();

    if (existing) {
      existing.setAttribute('href', url);
      applyExternalAttrs(existing, url);
    } else {
      const anchor = document.createElement('a');
      // href first, then target and rel, matching the order used everywhere
      // else in the site's markup.
      anchor.setAttribute('href', url);
      applyExternalAttrs(anchor, url);
      try {
        range.surroundContents(anchor);
      } catch (err) {
        // surroundContents refuses a range that partially covers an element.
        anchor.appendChild(range.extractContents());
        range.insertNode(anchor);
      }
    }

    hidePopover();
    if (host) {
      refreshSaveState();
      saveDraft();
      setStatus('link added, remember to save');
    }
  }

  function applyExternalAttrs(anchor, url) {
    if (isExternal(url)) {
      anchor.setAttribute('target', '_blank');
      anchor.setAttribute('rel', 'noopener noreferrer');
    } else {
      anchor.removeAttribute('target');
      anchor.removeAttribute('rel');
    }
  }

  function removeLink() {
    restoreSelection();
    const anchor = anchorAtCursor();
    if (!anchor) {
      setStatus('cursor is not inside a link', true);
      return;
    }
    const parent = anchor.parentNode;
    while (anchor.firstChild) parent.insertBefore(anchor.firstChild, anchor);
    parent.removeChild(anchor);
    parent.normalize();
    hidePopover();
    refreshSaveState();
    saveDraft();
    setStatus('link removed, remember to save');
  }

  /* ---------- save ---------- */

  // Resolves true only when every pending block reached the file.
  async function save() {
    const dirty = changed();
    if (dirty.length === 0) return true;

    saveBtn.disabled = true;
    setStatus('saving...');

    let ok = false;
    const edits = dirty.map(el => ({ old: originals.get(el), new: serialize(el) }));

    try {
      const response = await fetch('/api/edits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: PAGE, edits }),
      });
      const result = await response.json();

      if (!response.ok) {
        setStatus(result.error || 'Save failed.', true);
        refreshSaveState();
        return false;
      }

      // Only the blocks the server actually rewrote get a new lookup key. A
      // refused block keeps its old one so a retry still knows what to search for.
      let failed = 0;
      result.results.forEach((outcome, i) => {
        if (outcome.ok) originals.set(dirty[i], edits[i].new);
        else failed++;
      });

      if (failed > 0) {
        const reason = result.results.find(r => !r.ok).reason;
        setStatus(`${result.applied} saved, ${failed} refused: ${reason}`, true);
      } else {
        setStatus(`saved ${result.applied} to ${result.file}`);
      }
      ok = failed === 0;
    } catch (err) {
      setStatus(`Save failed: ${err.message}`, true);
    }

    saveDraft();
    refreshSaveState();
    return ok;
  }

  /* ---------- wiring ---------- */

  toggleBtn.addEventListener('click', () => setEditing(!editing));
  saveBtn.addEventListener('click', save);
  linkBtn.addEventListener('click', showPopover);
  pop.querySelector('.__apply').addEventListener('click', applyLink);
  pop.querySelector('.__unlink').addEventListener('click', removeLink);

  urlInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); applyLink(); }
    if (event.key === 'Escape') { event.preventDefault(); hidePopover(); }
  });

  document.addEventListener('keydown', event => {
    const meta = event.metaKey || event.ctrlKey;
    if (meta && event.key === 's') {
      event.preventDefault();
      if (editing) save();
    }
    if (meta && event.key === 'k') {
      event.preventDefault();
      if (!editing) setEditing(true);
      showPopover();
    }
    if (event.key === 'Escape') hidePopover();
  });

  // Both calls are needed: Chrome honours preventDefault, older Safari and
  // Firefox only act on returnValue. Missing the second one is what let a
  // closed tab silently discard an edit.
  window.addEventListener('beforeunload', event => {
    if (changed().length === 0) return;
    event.preventDefault();
    event.returnValue = '';
    return '';
  });

  document.head.appendChild(style);
  document.body.appendChild(bar);
  document.body.appendChild(pop);
  document.body.appendChild(draftBar);
  capture();

  function capture() {
    targets().forEach(el => {
      if (!originals.has(el)) originals.set(el, serialize(el));
    });
  }

  // Offer back anything the last session left behind.
  const draft = readDraft();
  if (draft && draft.entries && draft.entries.length) {
    const when = new Date(draft.at).toLocaleString();
    draftBar.querySelector('.__draft-msg').textContent =
      `${draft.entries.length} unsaved edit${draft.entries.length === 1 ? '' : 's'} from ${when}.`;
    draftBar.classList.add('__open');

    draftBar.querySelector('.__draft-restore').addEventListener('click', () => {
      const n = restoreDraft(draft);
      draftBar.classList.remove('__open');
      setEditing(true);
      setStatus(n ? `restored ${n}, now save them` : 'the page changed underneath those drafts', !n);
    });
    draftBar.querySelector('.__draft-discard').addEventListener('click', () => {
      localStorage.removeItem(DRAFT_KEY);
      draftBar.classList.remove('__open');
    });
  }
})();

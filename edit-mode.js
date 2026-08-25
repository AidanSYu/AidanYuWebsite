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
 */
(function () {
  const PAGE = document.currentScript ? document.currentScript.dataset.page : location.pathname;

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

  function capture() {
    targets().forEach(el => {
      if (!originals.has(el)) originals.set(el, el.innerHTML);
    });
  }

  function changed() {
    return targets().filter(el => originals.has(el) && el.innerHTML !== originals.get(el));
  }

  // Chrome/Safari/Firefox 136+ honour plaintext-only, which stops pasted markup
  // and stray <div> wrappers from ending up in the source file. Where it is not
  // supported we fall back to plain contenteditable plus a paste sanitiser.
  let plaintextSupported = true;
  (function probe() {
    const probeEl = document.createElement('div');
    probeEl.setAttribute('contenteditable', 'plaintext-only');
    plaintextSupported = probeEl.contentEditable === 'plaintext-only';
  })();

  function onPaste(event) {
    if (plaintextSupported) return;
    event.preventDefault();
    const text = (event.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  }

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
    .__edit-bar button, .__edit-bar a {
      font: inherit; color: #fff; background: #333; border: 0;
      padding: 6px 10px; border-radius: 5px; cursor: pointer; text-decoration: none;
    }
    .__edit-bar button:hover, .__edit-bar a:hover { background: #444; }
    .__edit-bar button[disabled] { opacity: 0.4; cursor: default; }
    .__edit-bar .__save { background: #2563eb; }
    .__edit-bar .__save:hover { background: #1d4ed8; }
    .__edit-status { max-width: 320px; opacity: 0.85; font-weight: 400; }
  `;

  const bar = document.createElement('div');
  bar.className = '__edit-bar';
  bar.innerHTML = `
    <button type="button" class="__toggle">edit</button>
    <button type="button" class="__save" disabled>save</button>
    <a href="/admin">new post</a>
    <span class="__edit-status"></span>
  `;

  const toggleBtn = bar.querySelector('.__toggle');
  const saveBtn = bar.querySelector('.__save');
  const status = bar.querySelector('.__edit-status');

  function setStatus(message, isError) {
    status.textContent = message || '';
    status.style.color = isError ? '#fca5a5' : '#fff';
  }

  function refreshSaveState() {
    const count = changed().length;
    saveBtn.disabled = count === 0;
    saveBtn.textContent = count > 0 ? `save (${count})` : 'save';
  }

  function setEditing(on) {
    editing = on;
    document.body.classList.toggle('__edit-on', on);
    toggleBtn.textContent = on ? 'done' : 'edit';

    targets().forEach(el => {
      if (on) {
        el.setAttribute('contenteditable', plaintextSupported ? 'plaintext-only' : 'true');
        el.addEventListener('paste', onPaste);
        el.addEventListener('input', refreshSaveState);
      } else {
        el.removeAttribute('contenteditable');
        el.removeEventListener('paste', onPaste);
        el.removeEventListener('input', refreshSaveState);
      }
    });

    setStatus(on ? 'click any text to retype it' : '');
    refreshSaveState();
  }

  async function save() {
    const dirty = changed();
    if (dirty.length === 0) return;

    saveBtn.disabled = true;
    setStatus('saving...');

    const edits = dirty.map(el => ({ old: originals.get(el), new: el.innerHTML }));

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
        return;
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
    } catch (err) {
      setStatus(`Save failed: ${err.message}`, true);
    }

    refreshSaveState();
  }

  toggleBtn.addEventListener('click', () => setEditing(!editing));
  saveBtn.addEventListener('click', save);

  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key === 's') {
      event.preventDefault();
      if (editing) save();
    }
  });

  window.addEventListener('beforeunload', event => {
    if (changed().length > 0) event.preventDefault();
  });

  document.head.appendChild(style);
  document.body.appendChild(bar);
  capture();
})();

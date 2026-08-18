(function () {
  'use strict';

  const CLASS_HIDDEN = 'ytpls-hidden';
  const WRAP_CLASS = 'ytpls-search-wrap';

  const SELECTORS = {
    playlistRoot: 'ytd-playlist-video-list-renderer',
    playlistItems: 'ytd-playlist-video-renderer',
    watchRoot: 'ytd-playlist-panel-renderer',
    watchItems: 'ytd-playlist-panel-video-renderer',
  };

  let currentInstance = null; // { root, mutationObserver, mode }

  function debounce(fn, wait) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  function waitForElement(selector, { timeout = 8000, interval = 250 } = {}) {
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        const el = document.querySelector(selector);
        if (el) {
          resolve(el);
          return;
        }
        if (Date.now() - start >= timeout) {
          resolve(null);
          return;
        }
        setTimeout(tick, interval);
      };
      tick();
    });
  }

  function getItemTitle(itemEl) {
    const titleEl = itemEl.querySelector('#video-title');
    if (!titleEl) return '';
    return (titleEl.getAttribute('title') || titleEl.textContent || '').trim();
  }

  function normalize(text) {
    return text.toLowerCase();
  }

  function buildSearchBox() {
    const wrap = document.createElement('div');
    wrap.className = WRAP_CLASS;
    wrap.innerHTML = `
      <div class="ytpls-search-box">
        <svg class="ytpls-search-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path fill="currentColor" d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z"></path>
        </svg>
        <input type="text" class="ytpls-search-input" placeholder="재생목록 내 동영상 검색" autocomplete="off" spellcheck="false" />
        <button type="button" class="ytpls-clear-btn" title="지우기" aria-label="검색어 지우기">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"></path>
          </svg>
        </button>
      </div>
      <div class="ytpls-result-count" aria-live="polite"></div>
    `;
    return wrap;
  }

  function applyFilter(items, query, countEl) {
    const keywords = normalize(query).split(/\s+/).filter(Boolean);
    let visibleCount = 0;

    items.forEach((item) => {
      const title = normalize(getItemTitle(item));
      const matches = keywords.length === 0 || keywords.every((kw) => title.includes(kw));
      item.classList.toggle(CLASS_HIDDEN, !matches);
      if (matches) visibleCount += 1;
    });

    if (!countEl) return;
    if (keywords.length === 0) {
      countEl.textContent = '';
    } else {
      countEl.textContent = `${visibleCount} / ${items.length}개 표시`;
    }
  }

  function teardownCurrentInstance() {
    if (!currentInstance) return;
    if (currentInstance.mutationObserver) {
      currentInstance.mutationObserver.disconnect();
    }
    if (currentInstance.wrap && currentInstance.wrap.isConnected) {
      currentInstance.wrap.remove();
    }
    currentInstance = null;
  }

  function setupForRoot(root, itemsSelector, insertBeforeSelector, mode) {
    if (!root || root.querySelector(`:scope > .${WRAP_CLASS}`)) return;

    const wrap = buildSearchBox();
    const insertBeforeEl = insertBeforeSelector ? root.querySelector(insertBeforeSelector) : root.firstChild;
    if (insertBeforeEl) {
      root.insertBefore(wrap, insertBeforeEl);
    } else {
      root.insertBefore(wrap, root.firstChild);
    }

    const input = wrap.querySelector('.ytpls-search-input');
    const clearBtn = wrap.querySelector('.ytpls-clear-btn');
    const countEl = wrap.querySelector('.ytpls-result-count');

    const runFilter = () => {
      const items = Array.from(root.querySelectorAll(itemsSelector));
      applyFilter(items, input.value, countEl);
    };

    const debouncedFilter = debounce(runFilter, 120);

    input.addEventListener('input', debouncedFilter);
    clearBtn.addEventListener('click', () => {
      input.value = '';
      input.focus();
      runFilter();
    });

    const itemsContainer = insertBeforeEl || root;
    const mutationObserver = new MutationObserver(() => {
      if (input.value.trim()) {
        debouncedFilter();
      }
    });
    mutationObserver.observe(itemsContainer, { childList: true, subtree: false });

    currentInstance = { wrap, mutationObserver, mode };
  }

  async function tryInitPlaylistPage() {
    const root = await waitForElement(SELECTORS.playlistRoot);
    if (!root) return false;
    const contentsEl = root.querySelector('#contents');
    setupForRoot(root, SELECTORS.playlistItems, contentsEl ? '#contents' : null, 'playlist');
    return true;
  }

  async function tryInitWatchPanel() {
    const root = await waitForElement(SELECTORS.watchRoot);
    if (!root) return false;
    const itemsEl = root.querySelector('#items');
    setupForRoot(root, SELECTORS.watchItems, itemsEl ? '#items' : null, 'watch');
    return true;
  }

  function isPlaylistRelevantUrl() {
    const url = new URL(window.location.href);
    if (url.pathname === '/playlist') return true;
    if (url.pathname === '/watch' && url.searchParams.has('list')) return true;
    return false;
  }

  async function init() {
    teardownCurrentInstance();

    if (!isPlaylistRelevantUrl()) return;

    const url = new URL(window.location.href);
    if (url.pathname === '/playlist') {
      await tryInitPlaylistPage();
    } else if (url.pathname === '/watch') {
      await tryInitWatchPanel();
    }
  }

  const debouncedInit = debounce(init, 200);

  document.addEventListener('yt-navigate-finish', debouncedInit);
  window.addEventListener('yt-navigate-finish', debouncedInit);

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  }
})();

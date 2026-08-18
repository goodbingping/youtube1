(function () {
  'use strict';

  const CLASS_HIDDEN = 'ytpls-hidden';
  const WRAP_CLASS = 'ytpls-search-wrap';
  const FILTER_WRAP_CLASS = 'ytpls-filter-wrap';
  const FILTER_ACTIVE_CLASS = 'ytpls-filter-active';

  const SELECTORS = {
    playlistRoot: 'ytd-playlist-video-list-renderer',
    playlistItems: 'ytd-playlist-video-renderer',
    watchRoot: 'ytd-playlist-panel-renderer',
    watchItems: 'ytd-playlist-panel-video-renderer',
    channelSearchRoot: 'ytd-section-list-renderer',
    channelSearchVideoItems: 'ytd-video-renderer',
    channelSearchPlaylistItems: 'ytd-playlist-renderer',
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

  function buildFilterBar() {
    const wrap = document.createElement('div');
    wrap.className = FILTER_WRAP_CLASS;
    wrap.innerHTML = `
      <div class="ytpls-filter-group" role="group" aria-label="검색 결과 유형 필터">
        <button type="button" class="ytpls-filter-btn ${FILTER_ACTIVE_CLASS}" data-filter="all">전체</button>
        <button type="button" class="ytpls-filter-btn" data-filter="video">동영상</button>
        <button type="button" class="ytpls-filter-btn" data-filter="playlist">재생목록</button>
      </div>
      <div class="ytpls-filter-count" aria-live="polite"></div>
    `;
    return wrap;
  }

  function applyTypeFilter(root, filter, countEl) {
    const videos = Array.from(root.querySelectorAll(SELECTORS.channelSearchVideoItems));
    const playlists = Array.from(root.querySelectorAll(SELECTORS.channelSearchPlaylistItems));

    videos.forEach((el) => el.classList.toggle(CLASS_HIDDEN, filter === 'playlist'));
    playlists.forEach((el) => el.classList.toggle(CLASS_HIDDEN, filter === 'video'));

    if (!countEl) return;
    if (filter === 'video') {
      countEl.textContent = `동영상 ${videos.length}개`;
    } else if (filter === 'playlist') {
      countEl.textContent = `재생목록 ${playlists.length}개`;
    } else {
      countEl.textContent = `동영상 ${videos.length}개 · 재생목록 ${playlists.length}개`;
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

  function setupChannelSearchFilter(root) {
    if (!root || root.querySelector(`:scope > .${FILTER_WRAP_CLASS}`)) return;

    const wrap = buildFilterBar();
    const contentsEl = root.querySelector('#contents');
    if (contentsEl) {
      root.insertBefore(wrap, contentsEl);
    } else {
      root.insertBefore(wrap, root.firstChild);
    }

    const buttons = Array.from(wrap.querySelectorAll('.ytpls-filter-btn'));
    const countEl = wrap.querySelector('.ytpls-filter-count');
    let activeFilter = 'all';

    const runFilter = () => applyTypeFilter(root, activeFilter, countEl);

    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.filter === activeFilter) return;
        activeFilter = btn.dataset.filter;
        buttons.forEach((b) => b.classList.toggle(FILTER_ACTIVE_CLASS, b === btn));
        runFilter();
      });
    });

    runFilter();

    const debouncedRunFilter = debounce(runFilter, 120);
    const mutationObserver = new MutationObserver(() => {
      if (activeFilter !== 'all') debouncedRunFilter();
    });
    mutationObserver.observe(contentsEl || root, { childList: true, subtree: true });

    currentInstance = { wrap, mutationObserver, mode: 'channel-search' };
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

  async function tryInitChannelSearch() {
    const root = await waitForElement(SELECTORS.channelSearchRoot);
    if (!root) return false;
    setupChannelSearchFilter(root);
    return true;
  }

  function isChannelSearchUrl(url) {
    return url.pathname !== '/search' && url.pathname.endsWith('/search');
  }

  async function init() {
    teardownCurrentInstance();

    const url = new URL(window.location.href);
    if (url.pathname === '/playlist') {
      await tryInitPlaylistPage();
    } else if (url.pathname === '/watch' && url.searchParams.has('list')) {
      await tryInitWatchPanel();
    } else if (isChannelSearchUrl(url)) {
      await tryInitChannelSearch();
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

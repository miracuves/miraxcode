// cdr-chat-virtual.js — windowed chat renderer for bulk session restore (Coder Mode)
(function () {
  'use strict';

  const DEFAULT_USER_H = 88;
  const DEFAULT_ASST_H = 160;
  const OVERSCAN = 6;

  class CdrChatVirtual {
    constructor(container) {
      this.container = container;
      this.liveMode = true;
      this.items = [];
      this.offsets = [];
      this.totalHeight = 0;
      this.renderItem = null;
      this._onScroll = this._onScroll.bind(this);
      this._scrollRaf = 0;
      this._topSpacer = null;
      this._viewport = null;
      this._bottomSpacer = null;
      this._truncNote = null;
    }

    /** Direct DOM append during active agent runs */
    enterLiveMode() {
      if (this.liveMode) return;
      this.liveMode = true;
      this._detachStructure();
    }

    isLiveMode() {
      return this.liveMode;
    }

    _detachStructure() {
      if (!this.container) return;
      this.container.removeEventListener('scroll', this._onScroll);
      this._topSpacer = this._viewport = this._bottomSpacer = null;
    }

    _ensureStructure() {
      const el = this.container;
      if (!el) return;
      el.innerHTML = '';
      this._truncNote = null;
      this._topSpacer = document.createElement('div');
      this._topSpacer.className = 'cdr-vscroll-top';
      this._viewport = document.createElement('div');
      this._viewport.className = 'cdr-vscroll-viewport';
      this._bottomSpacer = document.createElement('div');
      this._bottomSpacer.className = 'cdr-vscroll-bottom';
      el.appendChild(this._topSpacer);
      el.appendChild(this._viewport);
      el.appendChild(this._bottomSpacer);
      el.addEventListener('scroll', this._onScroll, { passive: true });
    }

    _estimateHeight(item) {
      if (!item) return DEFAULT_ASST_H;
      if (item.compare) return 280;
      if (item.images?.length) return 320;
      if (item.role === 'user') {
        const lines = Math.ceil(String(item.content || '').length / 72);
        return Math.max(DEFAULT_USER_H, 48 + lines * 20);
      }
      const len = String(item.content || '').length;
      return Math.max(DEFAULT_ASST_H, Math.min(520, 72 + Math.ceil(len / 90) * 18));
    }

    _rebuildOffsets() {
      this.offsets = [];
      let y = 0;
      for (let i = 0; i < this.items.length; i++) {
        this.offsets[i] = y;
        y += this._estimateHeight(this.items[i]);
      }
      this.totalHeight = y;
    }

    _findIndexAt(scrollTop) {
      let lo = 0;
      let hi = this.items.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (this.offsets[mid + 1] <= scrollTop) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    }

    _onScroll() {
      if (this.liveMode || !this.items.length) return;
      if (this._scrollRaf) return;
      this._scrollRaf = requestAnimationFrame(() => {
        this._scrollRaf = 0;
        this._paintVisible();
      });
    }

    _paintVisible() {
      if (!this._viewport || !this.container) return;
      const scrollTop = this.container.scrollTop;
      const viewH = this.container.clientHeight || 400;
      const start = Math.max(0, this._findIndexAt(scrollTop) - OVERSCAN);
      let end = start;
      const bottom = scrollTop + viewH;
      while (end < this.items.length && this.offsets[end] < bottom) end++;
      end = Math.min(this.items.length, end + OVERSCAN);

      this._topSpacer.style.height = (this.offsets[start] || 0) + 'px';
      const bottomH = Math.max(0, this.totalHeight - (this.offsets[end] || this.totalHeight));
      this._bottomSpacer.style.height = bottomH + 'px';

      this._viewport.innerHTML = '';
      const frag = document.createDocumentFragment();
      for (let i = start; i < end; i++) {
        const node = this.renderItem?.(this.items[i], i);
        if (node) frag.appendChild(node);
      }
      this._viewport.appendChild(frag);
    }

    /**
     * Bulk render messages (tab switch / session restore).
     * @param {Array} items - {role, content}
     * @param {Function} renderItem - returns HTMLElement
     * @param {{ hiddenCount?: number }} opts
     */
    setMessages(items, renderItem, opts = {}) {
      if (!this.container) return;
      this.liveMode = false;
      this.renderItem = renderItem;
      this.items = items || [];
      this._rebuildOffsets();
      this._ensureStructure();

      if (opts.hiddenCount > 0) {
        if (!this._truncNote) {
          this._truncNote = document.createElement('div');
          this._truncNote.className = 'cdr-msg-truncated-note';
        }
        this._truncNote.textContent =
          `${opts.hiddenCount} earlier message${opts.hiddenCount === 1 ? '' : 's'} hidden for performance — export chat for full history`;
        this.container.insertBefore(this._truncNote, this._topSpacer);
      }

      this._paintVisible();
      requestAnimationFrame(() => {
        this.container.scrollTop = this.container.scrollHeight;
      });
    }

    scrollToBottom(force) {
      const el = this.container;
      if (!el) return;
      if (force) {
        el.scrollTop = el.scrollHeight;
        return;
      }
      if (this._scrollRaf) return;
      this._scrollRaf = requestAnimationFrame(() => {
        this._scrollRaf = 0;
        el.scrollTop = el.scrollHeight;
      });
    }
  }

  window.CdrChatVirtual = CdrChatVirtual;
})();

// Open screen — the 3D pack + reveal live behind this overlay.
import { addCards, addToBankroll } from '../../state/collection.js';
import { rarityOf, TIER_ORDER } from '../../game/rarity.js';

export const open = {
  enter(el, ctx) {
    this.router = ctx?.router;

    // Tell the scene manager we've entered the open tab so it can reset the
    // pack if no reveal is currently in progress.
    window.dispatchEvent(new CustomEvent('game:enterOpen'));

    el.innerHTML = `
      <div class="open-counter ui" id="op-counter" hidden></div>

      <div class="open-center">
        <div class="reveal-name" id="op-name" hidden>
          <span class="rv-pill" id="op-pill"></span>
          <span class="rv-title" id="op-title"></span>
          <div class="rv-price" id="op-price" hidden></div>
        </div>
        <div class="reveal-prompt" id="op-prompt" hidden></div>
        <button class="btn-ghost ui" id="op-flip-all" hidden>Flip All</button>
      </div>

      <div class="hint-chip ui" id="op-hint">Grab the green tab · pull across</div>

      <div class="reveal-summary ui" id="op-summary" hidden></div>
    `;

    this.$ = (id) => el.querySelector(id);
    this.flash = document.createElement('div');
    this.flash.className = 'reveal-flash';
    document.body.appendChild(this.flash);

    this.h = {
      grab:     () => this._hint('Pull — all the way past the edge!'),
      open:     () => this._hint(''),
      start:    (e) => { this._hideHint(); this._setCounter(0, e.detail.total); },
      rowReady: (e) => { this._prompt('Tap cards to reveal'); this._showFlipAll(e.detail.total); },
      // card fires on each reveal: index = # revealed so far.
      card:     (e) => {
        this._setCounter(e.detail.index, e.detail.total);
        if (e.detail.index >= e.detail.total) {
          this._prompt('');
          const fa = this.$('#op-flip-all'); if (fa) fa.hidden = true;
        }
      },
      revealed:  (e) => this._showName(e.detail),
      price:     (e) => this._showPrice(e.detail.price),
      flashFx:   (e) => this._doFlash(e.detail.style),
      summary:   (e) => this._showSummary(e.detail),
    };

    window.addEventListener('pack:grab',       this.h.grab);
    window.addEventListener('pack:open',       this.h.open);
    window.addEventListener('reveal:start',    this.h.start);
    window.addEventListener('reveal:rowReady', this.h.rowReady);
    window.addEventListener('reveal:card',     this.h.card);
    window.addEventListener('reveal:revealed', this.h.revealed);
    window.addEventListener('reveal:price',    this.h.price);
    window.addEventListener('reveal:flash',    this.h.flashFx);
    window.addEventListener('reveal:summary',  this.h.summary);
  },

  exit() {
    if (this.h) {
      window.removeEventListener('pack:grab',       this.h.grab);
      window.removeEventListener('pack:open',       this.h.open);
      window.removeEventListener('reveal:start',    this.h.start);
      window.removeEventListener('reveal:rowReady', this.h.rowReady);
      window.removeEventListener('reveal:card',     this.h.card);
      window.removeEventListener('reveal:revealed', this.h.revealed);
      window.removeEventListener('reveal:price',    this.h.price);
      window.removeEventListener('reveal:flash',    this.h.flashFx);
      window.removeEventListener('reveal:summary',  this.h.summary);
    }
    this.flash?.remove();
    this.flash = null;
  },

  _hint(text) {
    const h = this.$('#op-hint');
    if (!h) return;
    if (text) { h.hidden = false; h.textContent = text; } else h.hidden = true;
  },
  _hideHint() { const h = this.$('#op-hint'); if (h) h.hidden = true; },

  _setCounter(i, total) {
    const c = this.$('#op-counter');
    if (!c) return;
    c.hidden = false;
    c.textContent = `${i} / ${total}`;
  },

  _prompt(text) {
    const p = this.$('#op-prompt');
    if (!p) return;
    if (text) { p.hidden = false; p.textContent = text; } else p.hidden = true;
  },

  _showName({ name, label, colorCss, isHit }) {
    const wrap  = this.$('#op-name');
    const pill  = this.$('#op-pill');
    const title = this.$('#op-title');
    wrap.hidden = false;
    pill.textContent = label;
    pill.style.background = colorCss;
    pill.style.color = '#10101a';
    title.textContent = name;
    title.style.textShadow = isHit ? `0 0 18px ${colorCss}` : 'none';
    wrap.classList.toggle('is-hit', !!isHit);
  },

  _showPrice(price) {
    const p = this.$('#op-price');
    if (!p) return;
    p.hidden = false;
    p.textContent = `~$${Number(price).toFixed(2)} market`;
  },

  _clearReveal() {
    const n  = this.$('#op-name');  if (n)  n.hidden  = true;
    const pr = this.$('#op-price'); if (pr) pr.hidden = true;
    this._prompt('');
  },

  _showFlipAll(total) {
    const btn = this.$('#op-flip-all');
    if (!btn || total <= 1) return;
    btn.hidden = false;
    btn.onclick = () => {
      btn.hidden = true;
      this._prompt('');
      window.dispatchEvent(new CustomEvent('reveal:revealAll'));
    };
  },

  _doFlash(style) {
    const f = this.flash;
    if (!f || !style || style === 'none') return;
    f.style.transition = 'none';
    if (style === 'white-edge') {
      f.style.background = 'radial-gradient(circle at 50% 42%, rgba(255,255,255,0) 42%, rgba(255,255,255,0.85) 100%)';
      f.style.opacity = '1';
    } else if (style === 'full-white') {
      f.style.background = '#ffffff';
      f.style.opacity = '0.92';
    } else if (style === 'full-darken') {
      f.style.background = 'radial-gradient(circle at 50% 42%, rgba(255,255,255,0.95) 0%, rgba(8,8,14,0.9) 72%)';
      f.style.opacity = '1';
    }
    void f.offsetWidth;
    const dur = style === 'full-darken' ? 0.95 : 0.5;
    f.style.transition = `opacity ${dur}s ease-out`;
    f.style.opacity = '0';
  },

  _showSummary({ tally, cards, best }) {
    // Track which card indices have been sold before adding to collection.
    const soldSet = new Set();

    const priceOf = (card) => +(card._livePrice ?? card.price ?? 0);

    const totalValue = () =>
      cards.reduce((sum, c, i) => sum + (soldSet.has(i) ? 0 : priceOf(c)), 0);

    const bestLine = best
      ? `<div class="sum-best">Best pull: <b style="color:${best.colorCss}">${best.name}</b> · ${best.label}</div>`
      : '';

    const renderTile = (card, i) => {
      const r      = rarityOf(card.tier);
      const price  = priceOf(card);
      const isSold = soldSet.has(i);
      const img    = card._imageUrl
        ? `<img src="${card._imageUrl}" class="sum-cimg" alt="${card.name}" loading="lazy">`
        : `<div class="sum-cimg sum-cimg--blank" style="border-color:${r.colorCss}22"></div>`;
      return `
        <div class="sum-ctile${isSold ? ' sum-ctile--sold' : ''}" data-idx="${i}">
          <div class="sum-cimg-wrap">${img}${isSold ? '<div class="sum-sold-badge">SOLD</div>' : ''}</div>
          <div class="sum-cname">${card.name}</div>
          <div class="sum-cprice" style="color:${r.colorCss}">~$${price.toFixed(2)}</div>
          ${isSold
            ? '<div class="sum-csold-label">Sold</div>'
            : `<button class="sum-sell-btn" data-idx="${i}">Sell $${price.toFixed(2)}</button>`}
        </div>`;
    };

    const renderSellAll = () => {
      const unsold  = cards.filter((_, i) => !soldSet.has(i));
      const total   = unsold.reduce((s, c) => s + priceOf(c), 0);
      const btn     = s.querySelector('#op-sell-all');
      if (!btn) return;
      if (unsold.length === 0) { btn.hidden = true; return; }
      btn.hidden = false;
      btn.textContent = `Sell All  $${total.toFixed(2)}`;
    };

    const s = this.$('#op-summary');
    s.hidden = false;
    s.innerHTML = `
      <div class="sum-card sum-card--wide">
        <div class="sum-title">Pack ripped!</div>
        ${bestLine}
        <div class="sum-cgrid" id="sum-cgrid"></div>
        <button class="btn-ghost sum-sell-all-btn" id="op-sell-all">Sell All</button>
        <div class="sum-actions">
          <button class="btn-primary" id="op-again">Rip another</button>
          <button class="btn-ghost" id="op-binder">View collection</button>
        </div>
      </div>`;

    const grid = s.querySelector('#sum-cgrid');
    const redraw = () => {
      grid.innerHTML = cards.map((c, i) => renderTile(c, i)).join('');
      renderSellAll();
      // Re-attach sell button listeners after redraw.
      grid.querySelectorAll('.sum-sell-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const i = +btn.dataset.idx;
          soldSet.add(i);
          addToBankroll(priceOf(cards[i]));
          redraw();
        });
      });
    };
    redraw();

    s.querySelector('#op-sell-all').addEventListener('click', () => {
      cards.forEach((c, i) => {
        if (!soldSet.has(i)) { soldSet.add(i); addToBankroll(priceOf(c)); }
      });
      redraw();
    });

    const closeSummary = () => {
      // Only add unsold cards to the collection.
      const kept = cards.filter((_, i) => !soldSet.has(i));
      try { if (kept.length) addCards(kept); } catch {}
      s.hidden = true;
      this._clearReveal();
      const ctr = this.$('#op-counter');  if (ctr) ctr.hidden = true;
      const fa  = this.$('#op-flip-all'); if (fa)  fa.hidden  = true;
    };

    s.querySelector('#op-again').addEventListener('click', () => {
      closeSummary();
      this._hint('Grab the green tab · pull across');
      window.dispatchEvent(new CustomEvent('game:ripAnother'));
    });
    s.querySelector('#op-binder').addEventListener('click', () => {
      closeSummary();
      this.router?.go('collection');
    });
  },
};

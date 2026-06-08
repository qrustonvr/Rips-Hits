// Open screen — the 3D pack + reveal live behind this overlay.
import { addCards } from '../../state/collection.js';
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
      </div>

      <div class="hint-chip ui" id="op-hint">Grab the green tab · pull across</div>

      <div class="reveal-summary ui" id="op-summary" hidden></div>
    `;

    this.$ = (id) => el.querySelector(id);
    this.flash = document.createElement('div');
    this.flash.className = 'reveal-flash';
    document.body.appendChild(this.flash);

    this.h = {
      grab:        () => this._hint('Pull — all the way past the edge!'),
      open:        () => this._hint(''),
      start:       (e) => { this._hideHint(); this._setCounter(0, e.detail.total); },
      card:        (e) => { this._clearReveal(); this._setCounter(e.detail.index + 1, e.detail.total); },
      gate:        () => this._prompt('Tap to flip'),
      flip:        () => this._prompt(''),
      revealed:    (e) => this._showName(e.detail),
      price:       (e) => this._showPrice(e.detail.price),
      holdPrompt:  () => this._prompt('Tap to continue · swipe to dismiss'),
      dismiss:     () => this._clearReveal(),
      flashFx:     (e) => this._doFlash(e.detail.style),
      summary:     (e) => this._showSummary(e.detail),
    };

    window.addEventListener('pack:grab',         this.h.grab);
    window.addEventListener('pack:open',         this.h.open);
    window.addEventListener('reveal:start',      this.h.start);
    window.addEventListener('reveal:card',       this.h.card);
    window.addEventListener('reveal:gate',       this.h.gate);
    window.addEventListener('reveal:flip',       this.h.flip);
    window.addEventListener('reveal:revealed',   this.h.revealed);
    window.addEventListener('reveal:price',      this.h.price);
    window.addEventListener('reveal:holdPrompt', this.h.holdPrompt);
    window.addEventListener('reveal:dismiss',    this.h.dismiss);
    window.addEventListener('reveal:flash',      this.h.flashFx);
    window.addEventListener('reveal:summary',    this.h.summary);
  },

  exit() {
    if (this.h) {
      window.removeEventListener('pack:grab',         this.h.grab);
      window.removeEventListener('pack:open',         this.h.open);
      window.removeEventListener('reveal:start',      this.h.start);
      window.removeEventListener('reveal:card',       this.h.card);
      window.removeEventListener('reveal:gate',       this.h.gate);
      window.removeEventListener('reveal:flip',       this.h.flip);
      window.removeEventListener('reveal:revealed',   this.h.revealed);
      window.removeEventListener('reveal:price',      this.h.price);
      window.removeEventListener('reveal:holdPrompt', this.h.holdPrompt);
      window.removeEventListener('reveal:dismiss',    this.h.dismiss);
      window.removeEventListener('reveal:flash',      this.h.flashFx);
      window.removeEventListener('reveal:summary',    this.h.summary);
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
    try { addCards(cards); } catch {}

    const rows = TIER_ORDER
      .filter((t) => tally[t])
      .map((t) => {
        const r = rarityOf(t);
        return `<div class="sum-row">
          <span class="sum-dot" style="background:${r.colorCss}"></span>
          <span class="sum-label">${r.label}</span>
          <span class="sum-count">×${tally[t]}</span>
        </div>`;
      }).join('');

    const bestLine = best
      ? `<div class="sum-best">Best pull: <b style="color:${best.colorCss}">${best.name}</b> · ${best.label}</div>`
      : '';

    const s = this.$('#op-summary');
    s.hidden = false;
    s.innerHTML = `
      <div class="sum-card">
        <div class="sum-title">Pack ripped!</div>
        ${bestLine}
        <div class="sum-rows">${rows}</div>
        <div class="sum-actions">
          <button class="btn-primary" id="op-again">Rip another</button>
          <button class="btn-ghost" id="op-binder">View collection</button>
        </div>
      </div>`;

    s.querySelector('#op-again').addEventListener('click', () => {
      s.hidden = true;
      this._clearReveal();
      const c = this.$('#op-counter'); if (c) c.hidden = true;
      this._hint('Grab the green tab · pull across');
      window.dispatchEvent(new CustomEvent('game:ripAnother'));
    });
    s.querySelector('#op-binder').addEventListener('click', () => {
      this.router?.go('collection');
    });
  },
};

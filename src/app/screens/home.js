// Home screen — pack grid + pack detail popup.
import { CardSource } from '../../game/cardSource.js';
import { getPullRates } from '../../game/pulls.js';
import { rarityOf } from '../../game/rarity.js';
import { getBankroll, deductBankroll } from '../../state/collection.js';

const QTY_KEY = 'ripsandhits.pendingQty';

// Tiers shown in the pull rates list (rarest → most common).
const DISPLAY_TIERS = ['SECRET_RARE', 'ULTRA_RARE', 'RARE'];

// Prefix asset paths with Vite's BASE_URL so they work on GitHub Pages
// (served under /Rips-Hits/) as well as local dev (served at /).
function asset(path) {
  if (!path) return '';
  const base = import.meta.env.BASE_URL ?? '/';
  return base.replace(/\/$/, '') + '/' + path.replace(/^\//, '');
}

export const home = {
  enter(el, ctx) {
    this._router = ctx?.router;
    this._el = el;
    this._renderGrid();
  },

  _renderGrid() {
    const el   = this._el;
    const sets = CardSource.getSets();

    const tiles = sets.map((s) => `
      <button class="pack-tile ui" data-pack="${s.id}">
        <div class="pack-tile-img">
          <img src="${asset(s.packTexture)}" alt="${s.name}" onerror="this.style.display='none'">
        </div>
        <div class="pack-tile-label">${s.name}</div>
      </button>`).join('');

    el.innerHTML = `
      <div class="home-wrap ui">
        <div class="home-header">
          <div class="screen-title">Packs</div>
          <div class="screen-sub">Tap a pack to open</div>
        </div>
        <div class="pack-grid">${tiles}</div>
      </div>
      <div id="pack-popup-overlay" class="pack-popup-overlay" hidden></div>
      <div id="pack-popup" class="pack-popup" hidden></div>
    `;

    el.querySelectorAll('.pack-tile').forEach((btn) => {
      btn.addEventListener('click', () => this._openPopup(btn.dataset.pack));
    });

    el.querySelector('#pack-popup-overlay').addEventListener('click', () => this._closePopup());
  },

  _openPopup(packId) {
    const set = CardSource.getSet(packId);
    if (!set) return;

    this._packId = packId;
    this._qty    = 1;

    const rates = getPullRates(packId).filter(
      (c) => DISPLAY_TIERS.includes(c.tier)
    );

    const rateRows = rates.map((c) => {
      const r   = rarityOf(c.tier);
      const pct = (c.pullRate * 100).toFixed(2);
      return `
        <div class="pr-row">
          <span class="pr-dot" style="background:${r.colorCss}"></span>
          <span class="pr-name">${c.name}</span>
          <span class="pr-pill" style="background:${r.colorCss}22;color:${r.colorCss}">${r.short}</span>
          <span class="pr-rate">${pct}%</span>
        </div>`;
    }).join('');

    const overlay = this._el.querySelector('#pack-popup-overlay');
    const popup   = this._el.querySelector('#pack-popup');

    popup.innerHTML = `
      <div class="pp-handle"></div>
      <div class="pp-art-wrap">
        <img class="pp-art" src="${asset(set.packTexture)}" alt="${set.name}"
             onerror="this.style.display='none'">
      </div>
      <div class="pp-info">
        <div class="pp-name">${set.name}</div>
        <div class="pp-price-tag">$${(set.price ?? 5).toFixed(2)} per pack</div>
      </div>
      <div class="pp-qty-row">
        <span class="pp-qty-label">Quantity</span>
        <div class="pp-qty-pills">
          ${[1,2,3,4,5].map((n) =>
            `<button class="pp-qty-btn${n === 1 ? ' active' : ''}" data-qty="${n}">${n}</button>`
          ).join('')}
        </div>
      </div>
      <div class="pp-total-row">
        <span class="pp-total-label">Total</span>
        <span id="pp-total" class="pp-total-value">$${(set.price ?? 5).toFixed(2)}</span>
      </div>
      <div class="pp-divider"></div>
      <div class="pp-rates-header">Top Cards</div>
      <div class="pp-rates-list">${rateRows || '<div class="pp-no-rates">No featured cards</div>'}</div>
      <button id="pp-open-btn" class="btn-primary pp-open-btn">Open 1 Pack — $${(set.price ?? 5).toFixed(2)}</button>
      <button id="pp-cancel-btn" class="btn-ghost pp-cancel-btn">Cancel</button>
    `;

    overlay.hidden = false;
    popup.hidden   = false;
    requestAnimationFrame(() => {
      overlay.classList.add('visible');
      popup.classList.add('visible');
    });

    popup.querySelectorAll('.pp-qty-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        popup.querySelectorAll('.pp-qty-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this._qty = parseInt(btn.dataset.qty, 10);
        this._updatePopupTotal(set);
      });
    });

    popup.querySelector('#pp-cancel-btn').addEventListener('click', () => this._closePopup());
    popup.querySelector('#pp-open-btn').addEventListener('click', () => this._confirmOpen(set));

    this._updatePopupTotal(set);
  },

  _updatePopupTotal(set) {
    const price     = set.price ?? 5;
    const total     = price * this._qty;
    const bankroll  = getBankroll();
    const canAfford = bankroll >= total;

    const totalEl = this._el.querySelector('#pp-total');
    const openBtn = this._el.querySelector('#pp-open-btn');
    if (totalEl) totalEl.textContent = '$' + total.toFixed(2);
    if (openBtn) {
      const label = this._qty === 1 ? '1 Pack' : `${this._qty} Packs`;
      openBtn.textContent = canAfford
        ? `Open ${label} — $${total.toFixed(2)}`
        : `Need $${(total - bankroll).toFixed(2)} more`;
      openBtn.disabled = !canAfford;
      openBtn.style.opacity = canAfford ? '1' : '0.45';
    }
  },

  _confirmOpen(set) {
    const price = set.price ?? 5;
    const total = price * this._qty;
    if (getBankroll() < total) return;

    deductBankroll(total);
    sessionStorage.setItem(QTY_KEY, String(this._qty));
    window.dispatchEvent(new CustomEvent('game:setGame', { detail: { game: this._packId } }));
    this._closePopup();
    this._router?.go('open');
  },

  _closePopup() {
    const overlay = this._el?.querySelector('#pack-popup-overlay');
    const popup   = this._el?.querySelector('#pack-popup');
    if (!overlay || !popup) return;
    overlay.classList.remove('visible');
    popup.classList.remove('visible');
    setTimeout(() => {
      overlay.hidden = true;
      popup.hidden   = true;
    }, 280);
  },

  exit() {
    this._closePopup();
  },
};

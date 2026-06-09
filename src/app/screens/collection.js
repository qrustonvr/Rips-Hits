// Collection screen — worth graph + card grid + card detail modal.
import { getCollection, getCollectionWorth, getWorthHistory, sellCard } from '../../state/collection.js';
import { rarityOf } from '../../game/rarity.js';
import { fetchCardData, getImageUrl } from '../../data/tcgdex.js';

export const collection = {
  enter(el) {
    this._el = el;
    this._render();
  },

  _render() {
    const el    = this._el;
    const cards = getCollection();
    const worth = getCollectionWorth();
    const history = getWorthHistory();

    const graphSvg = buildWorthGraph(history, worth);

    const sorted = [...cards].sort((a, b) => (b.pulledAt ?? 0) - (a.pulledAt ?? 0));

    const itemsHtml = sorted.length === 0
      ? `<div class="coll-empty">No cards yet — rip a pack!</div>`
      : sorted.map((card, i) => {
          const r = rarityOf(card.tier);
          return `
            <div class="coll-item" data-idx="${i}" data-uid="${card.uid ?? ''}" data-id="${card.id ?? ''}">
              <div class="coll-img-wrap">
                <div class="coll-img-placeholder" style="border-color:${r.colorCss}20"></div>
                <img class="coll-img" alt="${card.name}" loading="lazy">
              </div>
              <div class="coll-name">${card.name}</div>
              <div class="coll-pill" style="background:${r.colorCss}22;color:${r.colorCss}">${r.label}</div>
            </div>`;
        }).join('');

    el.innerHTML = `
      <div class="coll-wrap ui">
        <div class="coll-worth-panel">
          <div class="cw-top">
            <div>
              <div class="cw-label">Collection Value</div>
              <div class="cw-value">$${worth.toFixed(2)}</div>
            </div>
            <div class="cw-count">${cards.length} card${cards.length !== 1 ? 's' : ''}</div>
          </div>
          ${graphSvg}
        </div>
        <div class="coll-grid-wrap">
          <div class="coll-grid">${itemsHtml}</div>
        </div>
      </div>

      <!-- Card detail modal -->
      <div id="coll-modal-overlay" class="coll-modal-overlay" hidden></div>
      <div id="coll-modal" class="coll-modal" hidden></div>
    `;

    // Lazy-load images
    el.querySelectorAll('.coll-item').forEach((item, i) => {
      const cardData = sorted[i];
      if (!cardData?.id) return;
      const img = item.querySelector('.coll-img');
      if (!img) return;
      fetchCardData(cardData.id).then((tcg) => {
        const url = getImageUrl(tcg, 'low');
        if (url) {
          img.src = url;
          img.style.opacity = '0';
          img.onload = () => { img.style.transition = 'opacity 0.3s'; img.style.opacity = '1'; };
          img.onerror = () => { img.style.display = 'none'; };
        }
      }).catch(() => {});
    });

    // Card tap → detail modal
    el.querySelectorAll('.coll-item').forEach((item, i) => {
      item.addEventListener('click', () => this._openModal(sorted[i], item.querySelector('.coll-img')?.src));
    });

    // Overlay closes modal
    el.querySelector('#coll-modal-overlay').addEventListener('click', () => this._closeModal());
  },

  _openModal(card, imgSrc) {
    const r     = rarityOf(card.tier);
    const price = +(card._livePrice ?? card.price ?? card.basePrice ?? 0);
    const overlay = this._el.querySelector('#coll-modal-overlay');
    const modal   = this._el.querySelector('#coll-modal');
    if (!overlay || !modal) return;

    modal.innerHTML = `
      <div class="cm-handle"></div>
      <div class="cm-img-wrap">
        ${imgSrc ? `<img class="cm-img" src="${imgSrc}" alt="${card.name}">` : `<div class="cm-img-placeholder"></div>`}
      </div>
      <div class="cm-name">${card.name}</div>
      <div class="cm-pill" style="background:${r.colorCss}22;color:${r.colorCss}">${r.label}</div>
      <div class="cm-price">~$${price.toFixed(2)} market value</div>
      <button id="cm-sell-btn" class="btn-primary cm-sell-btn">
        Sell for $${price.toFixed(2)}
      </button>
      <button id="cm-close-btn" class="btn-ghost cm-close-btn">Keep it</button>
    `;

    overlay.hidden = false;
    modal.hidden   = false;
    requestAnimationFrame(() => {
      overlay.classList.add('visible');
      modal.classList.add('visible');
    });

    modal.querySelector('#cm-sell-btn').addEventListener('click', () => {
      if (card.uid) {
        sellCard(card.uid);
        this._closeModal();
        // Re-render to reflect sold card + updated worth
        setTimeout(() => this._render(), 300);
      }
    });
    modal.querySelector('#cm-close-btn').addEventListener('click', () => this._closeModal());
  },

  _closeModal() {
    const overlay = this._el?.querySelector('#coll-modal-overlay');
    const modal   = this._el?.querySelector('#coll-modal');
    if (!overlay || !modal) return;
    overlay.classList.remove('visible');
    modal.classList.remove('visible');
    setTimeout(() => {
      overlay.hidden = true;
      modal.hidden   = true;
    }, 280);
  },

  exit() {
    this._closeModal();
  },
};

// ---------------------------------------------------------------------------
// SVG area chart for collection worth over time
// ---------------------------------------------------------------------------
function buildWorthGraph(history, currentWorth) {
  const W = 340, H = 72, PAD = 8;

  // Always include current worth as the last data point
  const pts = [...history];
  if (!pts.length || pts[pts.length - 1].worth !== currentWorth) {
    pts.push({ t: Date.now(), worth: currentWorth });
  }

  if (pts.length < 2) {
    // Single point — flat line at 50%
    return `
      <svg class="cw-graph" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        <defs>
          <linearGradient id="gwGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#b6ff3c" stop-opacity="0.35"/>
            <stop offset="100%" stop-color="#b6ff3c" stop-opacity="0.03"/>
          </linearGradient>
        </defs>
        <path d="M${PAD},${H/2} L${W-PAD},${H/2}" stroke="#b6ff3c" stroke-width="1.5" fill="none"/>
        <path d="M${PAD},${H/2} L${W-PAD},${H/2} L${W-PAD},${H} L${PAD},${H} Z"
              fill="url(#gwGrad)"/>
      </svg>`;
  }

  const minW = Math.min(...pts.map((p) => p.worth));
  const maxW = Math.max(...pts.map((p) => p.worth));
  const rangeW = maxW - minW || 1;
  const minT = pts[0].t, maxT = pts[pts.length - 1].t;
  const rangeT = maxT - minT || 1;

  const toX = (t) => PAD + ((t - minT) / rangeT) * (W - PAD * 2);
  const toY = (w) => H - PAD - ((w - minW) / rangeW) * (H - PAD * 2);

  const linePoints = pts.map((p) => `${toX(p.t).toFixed(1)},${toY(p.worth).toFixed(1)}`).join(' L');
  const areaPoints = `M${toX(pts[0].t).toFixed(1)},${H} L${linePoints} L${toX(pts[pts.length-1].t).toFixed(1)},${H} Z`;

  return `
    <svg class="cw-graph" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <defs>
        <linearGradient id="gwGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#b6ff3c" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#b6ff3c" stop-opacity="0.03"/>
        </linearGradient>
      </defs>
      <path d="${areaPoints}" fill="url(#gwGrad)"/>
      <polyline points="${pts.map((p) => `${toX(p.t).toFixed(1)},${toY(p.worth).toFixed(1)}`).join(' ')}"
                stroke="#b6ff3c" stroke-width="1.5" fill="none"
                stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${toX(pts[pts.length-1].t).toFixed(1)}" cy="${toY(pts[pts.length-1].worth).toFixed(1)}"
              r="3" fill="#b6ff3c"/>
    </svg>`;
}

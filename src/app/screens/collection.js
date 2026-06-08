import { getCollection } from '../../state/collection.js';
import { rarityOf } from '../../game/rarity.js';
import { fetchCardData, getImageUrl } from '../../data/tcgdex.js';

export const collection = {
  enter(el) {
    const cards = getCollection();

    if (cards.length === 0) {
      el.innerHTML = `
        <div class="screen-pad ui">
          <div class="screen-title">Collection</div>
          <div class="screen-sub">No cards yet — rip a pack!</div>
        </div>`;
      return;
    }

    // Sort: newest first
    const sorted = [...cards].sort((a, b) => (b.pulledAt ?? 0) - (a.pulledAt ?? 0));

    const itemsHtml = sorted.map((card, i) => {
      const r = rarityOf(card.tier);
      return `
        <div class="coll-item" data-idx="${i}" data-id="${card.id ?? ''}">
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
        <div class="coll-header">
          <div class="screen-title">Collection</div>
          <div class="screen-sub">${cards.length} card${cards.length === 1 ? '' : 's'} pulled</div>
        </div>
        <div class="coll-grid">${itemsHtml}</div>
      </div>`;

    // Lazy-load images via TCGdex (uses localStorage cache so repeat visits are instant)
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
  },

  exit() {},
};

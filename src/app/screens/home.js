import { CardSource } from '../../game/cardSource.js';

const PACK_META = {
  pokemon:  { emoji: '(PKM)', tagline: 'Holo, ex, and secret rares await' },
  onepiece: { emoji: '(OP)',  tagline: 'Super Rares and Leader Rares await' },
};

export const home = {
  enter(el, ctx) {
    this._router = ctx?.router;

    const sets = CardSource.getSets();

    const packCards = sets.map((s) => {
      const meta = PACK_META[s.id] ?? { emoji: '(??)', tagline: 'Open to find out' };
      return `
        <button class="pack-card ui" data-game="${s.id}">
          <div class="pack-emoji">${meta.emoji}</div>
          <div class="pack-info">
            <div class="pack-name">${s.name}</div>
            <div class="pack-tag">${meta.tagline}</div>
            <div class="pack-count">${s.cardsPerPack} cards per pack</div>
          </div>
          <div class="pack-arrow">&#x203A;</div>
        </button>`;
    }).join('');

    el.innerHTML = `
      <div class="home-wrap ui">
        <div class="home-header">
          <div class="screen-title">Packs</div>
          <div class="screen-sub">Choose a pack to open</div>
        </div>
        <div class="pack-shelf">${packCards}</div>
      </div>
    `;

    el.querySelectorAll('.pack-card').forEach((btn) => {
      btn.addEventListener('click', () => this._openPack(btn.dataset.game));
    });
  },

  _openPack(game) {
    window.dispatchEvent(new CustomEvent('game:setGame', { detail: { game } }));
    this._router?.go('open');
  },

  exit() {},
};

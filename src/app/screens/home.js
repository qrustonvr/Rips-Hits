import { CardSource } from '../../game/cardSource.js';

export const home = {
  enter(el, ctx) {
    this._router = ctx?.router;

    const sets = CardSource.getSets();

    const packCards = sets.map((s) => {
      const total = Object.values(
        // sum all cards across rarity buckets for the card count display
        // We re-read from the pack pool to count accurately
        CardSource.getPool(s.id) ?? {}
      ).reduce((n, arr) => n + arr.length, 0);

      return `
        <button class="pack-card ui" data-pack="${s.id}">
          <div class="pack-img-wrap">
            <img class="pack-thumb" src="${s.packTexture}" alt="${s.name}" onerror="this.style.display='none'">
          </div>
          <div class="pack-info">
            <div class="pack-name">${s.name}</div>
            <div class="pack-tag">${s.game.charAt(0).toUpperCase() + s.game.slice(1)} TCG</div>
            <div class="pack-count">${s.cardsPerPack} cards per pack · ${total} in pool</div>
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
      btn.addEventListener('click', () => this._openPack(btn.dataset.pack));
    });
  },

  _openPack(packId) {
    window.dispatchEvent(new CustomEvent('game:setGame', { detail: { game: packId } }));
    this._router?.go('open');
  },

  exit() {},
};

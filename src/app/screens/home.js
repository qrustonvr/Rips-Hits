import { CardSource } from '../../game/cardSource.js';

export const home = {
  enter(el, ctx) {
    this._router = ctx?.router;

    const sets = CardSource.getSets();

    const tiles = sets.map((s) => {
      return `
        <button class="pack-tile ui" data-pack="${s.id}">
          <div class="pack-tile-img">
            <img src="${s.packTexture}" alt="${s.name}" onerror="this.style.display='none'">
          </div>
          <div class="pack-tile-label">${s.name}</div>
        </button>`;
    }).join('');

    el.innerHTML = `
      <div class="home-wrap ui">
        <div class="home-header">
          <div class="screen-title">Packs</div>
          <div class="screen-sub">Tap a pack to open</div>
        </div>
        <div class="pack-grid">${tiles}</div>
      </div>
    `;

    el.querySelectorAll('.pack-tile').forEach((btn) => {
      btn.addEventListener('click', () => this._openPack(btn.dataset.pack));
    });
  },

  _openPack(packId) {
    window.dispatchEvent(new CustomEvent('game:setGame', { detail: { game: packId } }));
    this._router?.go('open');
  },

  exit() {},
};

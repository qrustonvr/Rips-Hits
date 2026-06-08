import { getCollection } from '../../state/collection.js';

export const collection = {
  enter(el) {
    const cards = getCollection();
    el.innerHTML = `
      <div class="screen-pad ui">
        <div class="screen-title">Collection</div>
        <div class="screen-sub">${cards.length} card${cards.length === 1 ? '' : 's'} pulled</div>
        <div class="placeholder-card">
          Binder stub. Will show: pulled cards in a grid, tap to inspect
          in 3D with holo, filter by game / rarity / new.
        </div>
      </div>
    `;
  },
  exit() {},
};

export const profile = {
  enter(el) {
    el.innerHTML = `
      <div class="screen-pad ui">
        <div class="screen-title">Profile</div>
        <div class="screen-sub">Stub</div>
        <div class="placeholder-card">
          Will show: packs opened, hit rate, favorite pull, settings
          (sound / haptics toggles).
        </div>
      </div>
    `;
  },
  exit() {},
};

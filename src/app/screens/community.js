export const community = {
  enter(el) {
    el.innerHTML = `
      <div class="screen-pad ui">
        <div class="screen-title">Community</div>
        <div class="screen-sub">Stub (fake feed for the jam)</div>
        <div class="placeholder-card">
          Will show: fake feed of other players' pulls to make the world
          feel alive. Low priority — built from canned data on day 11.
        </div>
      </div>
    `;
  },
  exit() {},
};

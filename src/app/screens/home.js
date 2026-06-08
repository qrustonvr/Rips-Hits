export const home = {
  enter(el) {
    el.innerHTML = `
      <div class="screen-pad ui">
        <div class="screen-title">Rips &amp; Hits</div>
        <div class="screen-sub">TCG Design Challenge — The Pull</div>
        <div class="placeholder-card">
          Home screen stub. Will show: featured packs, daily free pack,
          recent big pulls from the community.
        </div>
      </div>
    `;
  },
  exit() {},
};

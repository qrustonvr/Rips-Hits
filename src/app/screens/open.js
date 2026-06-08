// Open screen — the money shot. 3D pack lives in the scene behind this overlay.
export const open = {
  enter(el) {
    el.innerHTML = `
      <div class="hint-chip ui" id="open-hint">Grab the green tab · pull across</div>
    `;
    this._chip = el.querySelector('#open-hint');
    this._onGrab = () => {
      if (this._chip) this._chip.textContent = 'Pull — all the way past the edge!';
    };
    this._onOpen = () => {
      if (this._chip) this._chip.textContent = 'Ripped! Card stack arrives in the next build';
    };
    window.addEventListener('pack:grab', this._onGrab);
    window.addEventListener('pack:open', this._onOpen);
  },
  exit() {
    window.removeEventListener('pack:grab', this._onGrab);
    window.removeEventListener('pack:open', this._onOpen);
    this._chip = null;
  },
};

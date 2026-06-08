// RevealController — drives the card-by-card reveal after the pack is ripped.
//
// One state machine per card walks the beat sequence:
//   slide-in → pre-flip glow → input gate → flip (reveal at 90°)
//   → hold (price fades in) → dismiss.
//
// Live card data (art image + market price) is fetched from TCGdex as soon as
// begin() is called. By the time each card reaches HOLD the fetch is usually
// complete; we fall back to the estimated price if it isn't.
import * as THREE from 'three';
import { createCard, CARD } from './card.js';
import { isHit } from '../../game/rarity.js';
import { fetchCardData, getImageUrl, extractPrice } from '../../data/tcgdex.js';

const P = {
  INTRO: 'intro',
  SLIDE_IN: 'slide_in',
  PREGLOW: 'preglow',
  GATE: 'gate',
  FLIP: 'flip',
  HOLD: 'hold',
  DISMISS: 'dismiss',
  DONE: 'done',
};

const CENTER = new THREE.Vector3(0, 0.25, 0);
const START  = new THREE.Vector3(0, -0.7, -0.25);

const easeOut   = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class RevealController {
  constructor({ canvas, camera, sound, particles, pack, scene }) {
    this.canvas    = canvas;
    this.camera    = camera;
    this.sound     = sound;
    this.particles = particles;
    this.pack      = pack;
    this.scene     = scene;

    this.cards  = [];
    this.pile   = [];
    this.index  = -1;
    this.card   = null;
    this.phase  = P.DONE;
    this.timer  = 0;
    this.active = false;

    this._revealFired      = false;
    this._priceFired       = false;
    this._holdPromptFired  = false;

    this.shake    = 0;
    this._camBase = camera.position.clone();

    this._down = null;
    canvas.addEventListener('pointerdown', (e) => this._onDown(e));
    canvas.addEventListener('pointerup',   (e) => this._onUp(e));
  }

  // ----- lifecycle -----------------------------------------------------------
  begin(cards) {
    this.reset();
    this.cards = cards.map((d) => createCard(d));
    this.active = true;
    this.index  = -1;
    this.phase  = P.INTRO;
    this.timer  = 0;
    this.pack.revealing = true;
    window.dispatchEvent(new CustomEvent('reveal:start', { detail: { total: cards.length } }));

    // Prefetch live data for every card immediately so images + prices are
    // ready by the time each card reaches the HOLD phase.
    this.cards.forEach((c, i) => {
      const id = c.data.id;
      if (!id) return;
      fetchCardData(id).then((tcgCard) => {
        if (!tcgCard) return;
        // Stash live price for use at HOLD time.
        const livePrice = extractPrice(tcgCard);
        if (livePrice != null) c.data._livePrice = livePrice;
        // Load the card art into the 3D material.
        const artUrl = getImageUrl(tcgCard);
        if (artUrl) c.setArt(artUrl);
      }).catch(() => { /* non-fatal — fall back to estimated price + no art */ });
    });
  }

  reset() {
    for (const c of this.cards) { this.scene.remove(c.group); c.dispose(); }
    for (const c of this.pile)  { this.scene.remove(c.group); c.dispose(); }
    this.cards  = [];
    this.pile   = [];
    this.card   = null;
    this.index  = -1;
    this.phase  = P.DONE;
    this.active = false;
    this.shake  = 0;
    if (this.pack) this.pack.revealing = false;
    this.camera.position.copy(this._camBase);
  }

  // ----- input ---------------------------------------------------------------
  _onDown(e) {
    if (!this.active) return;
    this._down = { x: e.clientX, y: e.clientY, t: performance.now() };
  }

  _onUp(e) {
    if (!this.active || !this._down) return;
    const dx   = e.clientX - this._down.x;
    const dy   = e.clientY - this._down.y;
    const dt   = performance.now() - this._down.t;
    const dist = Math.hypot(dx, dy);
    this._down = null;

    if (dist > 70)       this._onSwipe();
    else if (dt < 500)   this._onTap();
  }

  _onTap() {
    if (this.phase === P.GATE) {
      this._startFlip();
    } else if (this.phase === P.HOLD && this._holdPromptFired) {
      this._dismiss();
    }
  }

  _onSwipe() {
    if (this.phase === P.HOLD && this._holdPromptFired) this._dismiss();
  }

  // ----- per-card transitions ------------------------------------------------
  _nextCard() {
    this.index++;
    if (this.index >= this.cards.length) { this._finish(); return; }
    this.card = this.cards[this.index];
    this.scene.add(this.card.group);
    this.card.group.position.copy(START);
    this.card.group.scale.setScalar(0.7);
    this.card.flip.rotation.y = Math.PI;
    this.card.setGlow(0);
    this.card.setHoloIntensity(0);
    this._revealFired     = false;
    this._priceFired      = false;
    this._holdPromptFired = false;
    this.phase = P.SLIDE_IN;
    this.timer = 0;
    window.dispatchEvent(new CustomEvent('reveal:card', {
      detail: { index: this.index, total: this.cards.length },
    }));
  }

  _startFlip() {
    this.phase = P.FLIP;
    this.timer = 0;
    this._revealFired = false;
    window.dispatchEvent(new CustomEvent('reveal:flip'));
  }

  _fireReveal() {
    this._revealFired = true;
    const c = this.card;
    const r = c.rarity;
    const origin = c.group.position.clone();
    origin.y += 0.1;

    this.sound?.[r.stinger]?.();
    this.particles.burst(r.particles, { color: r.color, origin });
    this._flash(r.flash);
    this._haptic(r.tier);
    if (r.glow === 'rainbow-cycle') this.shake = 0.16;

    window.dispatchEvent(new CustomEvent('reveal:revealed', {
      detail: {
        name: c.data.name, tier: r.tier, label: r.label,
        colorCss: r.colorCss, isHit: isHit(r.tier),
      },
    }));
  }

  _dismiss() {
    this.phase = P.DISMISS;
    this.timer = 0;
    this._dismissFrom = this.card.group.position.clone();
    window.dispatchEvent(new CustomEvent('reveal:dismiss'));
  }

  _finish() {
    this.phase  = P.DONE;
    this.active = false;
    this.pack.revealing = false;
    const tally = {};
    for (const c of this.cards) {
      tally[c.data.tier] = (tally[c.data.tier] ?? 0) + 1;
    }
    const best = this.cards.reduce(
      (a, b) => (!a || rank(b.rarity.tier) > rank(a.rarity.tier) ? b : a), null
    );
    window.dispatchEvent(new CustomEvent('reveal:summary', {
      detail: {
        tally,
        cards: this.cards.map((c) => ({ ...c.data })),
        best: best
          ? { name: best.data.name, label: best.rarity.label, colorCss: best.rarity.colorCss }
          : null,
      },
    }));
  }

  // ----- main update ---------------------------------------------------------
  update(dt, time) {
    if (this.shake > 0.0005) {
      this.shake *= Math.exp(-dt * 7);
      this.camera.position.set(
        this._camBase.x + (Math.random() - 0.5) * this.shake,
        this._camBase.y + (Math.random() - 0.5) * this.shake,
        this._camBase.z
      );
    } else if (!this.camera.position.equals(this._camBase)) {
      this.camera.position.copy(this._camBase);
    }

    if (!this.active) return;
    this.timer += dt;
    const c = this.card;
    if (c) c.setTime(time);

    switch (this.phase) {
      case P.INTRO: {
        const k = Math.min(this.timer / 0.7, 1);
        if (this.pack?.group) {
          this.pack.group.position.y = -easeInOut(k) * 4.2;
          this.pack.group.scale.setScalar(1 - easeInOut(k) * 0.35);
        }
        if (k >= 1) this._nextCard();
        break;
      }

      case P.SLIDE_IN: {
        const dur = 0.35;
        const k   = Math.min(this.timer / dur, 1);
        const e   = easeOut(k);
        c.group.position.lerpVectors(START, CENTER, e);
        c.group.scale.setScalar(0.7 + 0.3 * e);
        if (k >= 1) { this.phase = P.PREGLOW; this.timer = 0; }
        break;
      }

      case P.PREGLOW: {
        const hold = c.rarity.glowHold;
        const k    = Math.min(this.timer / hold, 1);
        if (c.rarity.glow !== 'none') {
          const pulse = 0.55 + 0.45 * Math.sin(time * 7);
          c.setGlow(easeOut(k) * pulse * (0.5 + 0.5 * (rank(c.rarity.tier) / 4)));
        }
        c.group.position.y = CENTER.y + Math.sin(time * 2) * 0.015;
        if (k >= 1) {
          if (c.rarity.autoFlip) { this._startFlip(); }
          else {
            this.phase = P.GATE; this.timer = 0;
            window.dispatchEvent(new CustomEvent('reveal:gate', {
              detail: { tier: c.rarity.tier, label: c.rarity.label },
            }));
          }
        }
        break;
      }

      case P.GATE: {
        if (c.rarity.glow !== 'none') {
          c.setGlow(0.7 + 0.3 * Math.sin(time * 6));
        }
        break;
      }

      case P.FLIP: {
        const dur = c.rarity.flipDur;
        const k   = Math.min(this.timer / dur, 1);
        const e   = easeInOut(k);
        c.flip.rotation.y = Math.PI * (1 - e);
        if (!this._revealFired && e >= 0.5) this._fireReveal();
        if (k >= 1) { this.phase = P.HOLD; this.timer = 0; }
        break;
      }

      case P.HOLD: {
        const ramp = Math.min(this.timer / 0.5, 1);
        c.setHoloIntensity(c.rarity.holoIntensity * ramp);
        c.setHoloTilt(Math.sin(time * 1.4) * 0.7, Math.cos(time * 1.1) * 0.4);
        c.group.rotation.y  = Math.sin(time * 1.1) * 0.14;
        c.group.position.y  = CENTER.y + Math.sin(time * 1.6) * 0.01;
        if (!isHit(c.rarity.tier)) c.setGlow(Math.max(0, glowMat(c) - dt));

        if (!this._priceFired && this.timer >= 1.5) {
          this._priceFired = true;
          // Use live market price if TCGdex fetch completed, else estimated.
          const price = c.data._livePrice ?? c.data.price;
          window.dispatchEvent(new CustomEvent('reveal:price', {
            detail: { price },
          }));
        }
        if (!this._holdPromptFired && this.timer >= 0.8) {
          this._holdPromptFired = true;
          window.dispatchEvent(new CustomEvent('reveal:holdPrompt'));
        }
        break;
      }

      case P.DISMISS: {
        const dur = 0.4;
        const k   = Math.min(this.timer / dur, 1);
        const e   = easeInOut(k);
        const pileIdx = this.pile.length;
        const target  = new THREE.Vector3(-1.35 + pileIdx * 0.035, -1.15, 0.2);
        c.group.position.lerpVectors(this._dismissFrom, target, e);
        c.group.scale.setScalar(1 - 0.7 * e);
        c.group.rotation.y  = (1 - e) * c.group.rotation.y;
        c.flip.rotation.y   = 0;
        if (k >= 1) {
          this.pile.push(c);
          this.card = null;
          this._nextCard();
        }
        break;
      }

      default: break;
    }
  }

  // ----- fx helpers ----------------------------------------------------------
  _haptic(tier) {
    const pat = {
      COMMON: 0, UNCOMMON: 8, RARE: [12, 20],
      ULTRA_RARE: [10, 30, 10, 40], SECRET_RARE: [20, 40, 20, 60, 30, 90],
    }[tier];
    if (pat) this.sound?.haptic?.(pat);
  }

  _flash(style) {
    if (!style || style === 'none') return;
    window.dispatchEvent(new CustomEvent('reveal:flash', { detail: { style } }));
  }
}

function rank(tier) {
  return ['COMMON', 'UNCOMMON', 'RARE', 'ULTRA_RARE', 'SECRET_RARE'].indexOf(tier);
}

// Helper to read glow sprite opacity without exposing glowMat directly.
function glowMat(c) {
  return c.glow?.material?.opacity ?? 0;
}

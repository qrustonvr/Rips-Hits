// RevealController — drives the post-rip card reveal sequence.
//
// Flow (v2):
//   1. SHOOT_OUT  — cards burst from the pack in a staggered arc, face-down
//   2. PACK_EXIT  — pack slides/shrinks off-screen
//   3. ARRANGE    — cards slide into a centered row with easeOutBack snap
//   4. ROW_IDLE   — user taps any card to flip/reveal; each card is independent,
//                   no global lock — overlapping flips are fine and expected
import * as THREE from 'three';
import { createCard, CARD } from './card.js';
import { isHit } from '../../game/rarity.js';
import { fetchCardData, getImageUrl, extractPrice } from '../../data/tcgdex.js';

// ---- Tune these values to adjust feel ----------------------------------------
const CFG = {
  shootStagger:     0.075,  // s between each card launch (60–100 ms feel)
  shootDur:         0.44,   // s for the arc flight of each card
  shootArcHeight:   0.55,   // world-units of upward arc peak
  shootLandSpreadX: 0.65,   // half-range of the scattered landing X positions
  shootLandY:       0.70,   // world-Y of the scattered landing cloud (above the pack)
  packSlideDownY:   1.80,   // how far pack drops during shoot-out before PACK_EXIT takes over
  packExitDur:      0.42,   // s for the pack to slide off-screen
  arrangeDur:       0.40,   // s for each card to slide into its row slot
  arrangeStagger:   0.045,  // s between cards starting their slide
  flipDur:          0.20,   // s for the flip animation
  flipScalePeak:    1.13,   // scale multiplier at the reveal moment (pop)
  rowY:             0.10,   // world-Y centre of the finished card row (or centre of multi-row block)
  rowPadding:       0.10,   // fraction of screen width reserved as left/right margin
  rowSpacingFactor: 1.20,   // vertical gap between rows as a multiple of card height
  minCardScale:     0.28,   // minimum card scale before adding another row
  maxRowCount:      3,      // hard cap on number of rows
  summaryDelay:     1.20,   // s after last reveal before the summary fires
};

// ---- Global phases ------------------------------------------------------------
const PH = {
  INACTIVE:  'inactive',
  SHOOT_OUT: 'shoot_out',
  PACK_EXIT: 'pack_exit',
  ARRANGE:   'arrange',
  ROW_IDLE:  'row_idle',
  DONE:      'done',
};

// ---- Per-card states ----------------------------------------------------------
const CS = {
  WAITING:  'waiting',
  FLYING:   'flying',
  LANDED:   'landed',
  SETTLING: 'settling',
  IN_ROW:   'in_row',
  FLIPPING: 'flipping',
  REVEALED: 'revealed',
};

// ---- Easing ------------------------------------------------------------------
const easeOut     = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut   = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// Overshoot-style ease — card slides slightly past its target then snaps back.
const easeOutBack = (t, s = 1.70158) => {
  const c3 = s + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
};

// ==============================================================================
export class RevealController {
  constructor({ canvas, camera, sound, particles, pack, scene }) {
    this.canvas    = canvas;
    this.camera    = camera;
    this.sound     = sound;
    this.particles = particles;
    this.pack      = pack;
    this.scene     = scene;

    this.cards  = [];
    this.phase  = PH.INACTIVE;
    this.timer  = 0;
    this.active = false;

    this._nextShootIdx   = 0;
    this._revealedCount  = 0;
    this._awaitingFinish = false;
    this._finishTimer    = 0;

    this.shake    = 0;
    this._camBase = camera.position.clone();
    this._ray     = new THREE.Raycaster();

    this._down = null;
    canvas.addEventListener('pointerdown', (e) => this._onDown(e));
    canvas.addEventListener('pointerup',   (e) => this._onUp(e));
    // "Flip All" hook — open.js can dispatch this to reveal everything at once.
    window.addEventListener('reveal:revealAll', () => this.revealAll());
  }

  // ---- lifecycle -------------------------------------------------------------

  begin(cards) {
    this.reset();
    if (!cards.length) return;

    this.cards = cards.map((d) => {
      const c       = createCard(d);
      c._cs         = CS.WAITING;
      c._timer      = 0;
      c._from       = new THREE.Vector3();
      c._land       = new THREE.Vector3();
      c._slot       = new THREE.Vector3();
      c._slotScale  = 1;
      c._fromScale  = 1;
      c._fromRotZ   = 0;
      // Random tumble direction so cards feel physical on shoot-out.
      c._jitterRot  = (Math.random() - 0.5) * 0.6;
      c._revealFired = false;
      c._holoTimer   = 0;
      return c;
    });

    this.active          = true;
    this.phase           = PH.SHOOT_OUT;
    this.timer           = 0;
    this._nextShootIdx   = 0;
    this._revealedCount  = 0;
    this._awaitingFinish = false;
    this._finishTimer    = 0;
    this.pack.revealing  = true;

    window.dispatchEvent(new CustomEvent('reveal:start', { detail: { total: cards.length } }));

    // Prefetch art + prices immediately so they are ready by reveal time.
    this.cards.forEach((c) => {
      const id = c.data.id;
      if (!id) return;
      fetchCardData(id)
        .then((tcgCard) => {
          if (!tcgCard) return;
          const livePrice = extractPrice(tcgCard);
          if (livePrice != null) c.data._livePrice = livePrice;
          const artUrl = getImageUrl(tcgCard);
          if (artUrl) { c.setArt(artUrl); c.data._imageUrl = artUrl; }
        })
        .catch((err) => console.error(`[reveal] TCGdex failed for ${id}:`, err));
    });
  }

  reset() {
    for (const c of this.cards) { this.scene.remove(c.group); c.dispose(); }
    this.cards           = [];
    this.phase           = PH.INACTIVE;
    this.active          = false;
    this.shake           = 0;
    this._nextShootIdx   = 0;
    this._revealedCount  = 0;
    this._awaitingFinish = false;
    this._finishTimer    = 0;
    this._packExitStartY = 0;
    if (this.pack) this.pack.revealing = false;
    this.camera.position.copy(this._camBase);
  }

  /** Flip every remaining face-down card at once (no sequential wait). */
  revealAll() {
    if (this.phase !== PH.ROW_IDLE) return;
    for (const c of this.cards) {
      if (c._cs === CS.IN_ROW) this._startCardFlip(c);
    }
  }

  // ---- input -----------------------------------------------------------------

  _onDown(e) {
    if (!this.active) return;
    this._down = { x: e.clientX, y: e.clientY, t: performance.now() };
  }

  _onUp(e) {
    if (!this.active || !this._down) return;
    const dx   = e.clientX - this._down.x;
    const dy   = e.clientY - this._down.y;
    const dt   = performance.now() - this._down.t;
    this._down = null;
    if (Math.hypot(dx, dy) < 70 && dt < 500) this._onTap(e);
  }

  _onTap(e) {
    // Only process taps during ROW_IDLE; each card manages its own state —
    // no global "is animating" flag blocks input here.
    if (this.phase !== PH.ROW_IDLE) return;
    const c = this._hitTest(e);
    if (c && c._cs === CS.IN_ROW) this._startCardFlip(c);
  }

  _hitTest(e) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc  = new THREE.Vector2(
       ((e.clientX - rect.left) / rect.width)  *  2 - 1,
      -((e.clientY - rect.top)  / rect.height) *  2 + 1,
    );
    this._ray.setFromCamera(ndc, this.camera);

    const meshes = [];
    for (const c of this.cards) {
      if (c._cs === CS.IN_ROW) {
        c.group.traverse((o) => { if (o.isMesh) meshes.push(o); });
      }
    }
    if (!meshes.length) return null;

    const hits = this._ray.intersectObjects(meshes, false);
    if (!hits.length) return null;

    const target = hits[0].object;
    for (const c of this.cards) {
      let found = false;
      c.group.traverse((o) => { if (o === target) found = true; });
      if (found) return c;
    }
    return null;
  }

  // ---- per-card flip ---------------------------------------------------------

  _startCardFlip(c) {
    c._cs          = CS.FLIPPING;
    c._timer       = 0;
    c._revealFired = false;
    // Quick tactile click at the start of the flip.
    this.sound?.tick?.();
    this.sound?.haptic?.(4);
  }

  _fireReveal(c) {
    c._revealFired = true;
    const r      = c.rarity;
    const origin = c.group.position.clone();
    origin.y    += 0.1;

    this.sound?.[r.stinger]?.();
    this.particles.burst(r.particles, { color: r.color, origin });
    this._flash(r.flash);
    this._haptic(r.tier);
    if (r.glow === 'rainbow-cycle') this.shake = 0.16;

    this._revealedCount++;

    window.dispatchEvent(new CustomEvent('reveal:revealed', {
      detail: {
        name: c.data.name, tier: r.tier, label: r.label,
        colorCss: r.colorCss, isHit: isHit(r.tier),
      },
    }));
    // Counter update: how many have been revealed so far.
    window.dispatchEvent(new CustomEvent('reveal:card', {
      detail: { index: this._revealedCount, total: this.cards.length },
    }));

    const price = c.data._livePrice ?? c.data.price;
    if (price != null) {
      window.dispatchEvent(new CustomEvent('reveal:price', { detail: { price } }));
    }

    if (this._revealedCount >= this.cards.length) {
      this._awaitingFinish = true;
      this._finishTimer    = 0;
    }
  }

  _finish() {
    this.phase  = PH.DONE;
    this.active = false;
    if (this.pack) this.pack.revealing = false;

    const tally = {};
    for (const c of this.cards) {
      tally[c.data.tier] = (tally[c.data.tier] ?? 0) + 1;
    }
    const best = this.cards.reduce(
      (a, b) => (!a || rank(b.rarity.tier) > rank(a.rarity.tier) ? b : a), null,
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

  // ---- row layout ------------------------------------------------------------

  _computeRowSlots() {
    const n = this.cards.length;
    if (n === 0) return [];
    if (n === 1) return [{ pos: new THREE.Vector3(0, CFG.rowY, 0), scale: 1.0 }];

    // World-space usable width at z=0.
    const halfH   = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))
                  * this.camera.position.z;
    const usableW = halfH * this.camera.aspect * 2 * (1 - 2 * CFG.rowPadding);

    // Find the fewest rows where every card stays at or above CFG.minCardScale.
    let numRows = 1;
    for (let r = 1; r <= CFG.maxRowCount; r++) {
      numRows = r;
      const perRow  = Math.ceil(n / r);
      const spacing = perRow > 1 ? usableW / (perRow - 1) : usableW;
      if (Math.min(1.0, spacing / (CARD.W * 1.1)) >= CFG.minCardScale) break;
    }

    const perRow     = Math.ceil(n / numRows);
    const colSpacing = perRow > 1 ? usableW / (perRow - 1) : 0;
    const scale      = Math.max(0.26, Math.min(1.0,
      perRow > 1 ? colSpacing / (CARD.W * 1.1) : 1.0,
    ));

    const rowSpacing = CARD.H * scale * CFG.rowSpacingFactor;
    const topRowY    = CFG.rowY + ((numRows - 1) * rowSpacing) / 2;

    return this.cards.map((_, i) => {
      const row        = Math.floor(i / perRow);
      const col        = i % perRow;
      // Last row may be shorter — centre it independently.
      const cardsInRow = Math.min(perRow, n - row * perRow);
      const rowStartX  = -((cardsInRow - 1) * colSpacing) / 2;
      return {
        pos:   new THREE.Vector3(rowStartX + col * colSpacing, topRowY - row * rowSpacing, 0),
        scale,
      };
    });
  }

  // ---- main update -----------------------------------------------------------

  update(dt, time) {
    // Camera shake (decays exponentially, same as before).
    if (this.shake > 0.0005) {
      this.shake *= Math.exp(-dt * 7);
      this.camera.position.set(
        this._camBase.x + (Math.random() - 0.5) * this.shake,
        this._camBase.y + (Math.random() - 0.5) * this.shake,
        this._camBase.z,
      );
    } else if (this.shake <= 0.0005) {
      this.camera.position.copy(this._camBase);
      this.shake = 0;
    }

    if (!this.active) return;
    this.timer += dt;

    switch (this.phase) {
      case PH.SHOOT_OUT: this._tickShootOut(dt);       break;
      case PH.PACK_EXIT: this._tickPackExit(dt);       break;
      case PH.ARRANGE:   this._tickArrange(dt);        break;
      case PH.ROW_IDLE:  this._tickRowIdle(dt, time);  break;
    }
  }

  // ---- SHOOT_OUT -------------------------------------------------------------

  _tickShootOut(dt) {
    // Launch cards on their stagger schedule.
    while (this._nextShootIdx < this.cards.length) {
      if (this.timer < this._nextShootIdx * CFG.shootStagger) break;
      this._launchCard(this._nextShootIdx);
      this._nextShootIdx++;
    }

    // Slide the pack down with easeOut (moves fast immediately, clearing card paths).
    const totalShootDur = (this.cards.length - 1) * CFG.shootStagger + CFG.shootDur;
    if (this.pack?.group) {
      const k = Math.min(this.timer / Math.max(totalShootDur, 0.3), 1);
      this.pack.group.position.y = -easeOut(k) * CFG.packSlideDownY;
    }

    // Advance all in-flight cards; detect when the burst is complete.
    let allDone = (this._nextShootIdx >= this.cards.length);
    for (const c of this.cards) {
      if (c._cs === CS.WAITING) { allDone = false; continue; }
      if (c._cs !== CS.FLYING)  continue;

      c._timer += dt;
      const k   = Math.min(c._timer / CFG.shootDur, 1);
      this._animateFlight(c, k);
      if (k >= 1) {
        c._cs              = CS.LANDED;
        c.group.rotation.z = c._jitterRot;
        c.group.rotation.x = 0;
      } else {
        allDone = false;
      }
    }

    if (allDone) {
      // Remember where the pack is so PACK_EXIT can continue from there.
      this._packExitStartY = this.pack?.group?.position.y ?? 0;
      this.phase = PH.PACK_EXIT;
      this.timer = 0;
    }
  }

  _launchCard(idx) {
    const c = this.cards[idx];
    const n = this.cards.length;

    // Spread landing positions across a fan, with a little per-card jitter.
    const t    = n > 1 ? idx / (n - 1) : 0.5;
    const baseX = (t - 0.5) * 2 * CFG.shootLandSpreadX;
    c._land.set(
      baseX + (Math.random() - 0.5) * 0.18,
      CFG.shootLandY + (Math.random() - 0.5) * 0.12,
      idx * 0.02,                              // tiny z-stagger so they don't z-fight
    );

    // Launch from near the pack opening (top of pack ≈ y=1.05 in world space).
    c._from.set((Math.random() - 0.5) * 0.15, 1.05, 0);
    c.group.position.copy(c._from);
    c.group.scale.setScalar(0.85);
    c.flip.rotation.y = Math.PI;               // face-down
    c.setGlow(0);
    c.group.rotation.set(0, 0, 0);
    c._cs    = CS.FLYING;
    c._timer = 0;
    this.scene.add(c.group);

    // Quick tactile pop per card shoot.
    this.sound?.crackle?.();
    this.sound?.haptic?.(3);
  }

  _animateFlight(c, k) {
    // Horizontal: smooth deceleration.
    const ex = easeOut(k);
    const x  = c._from.x + (c._land.x - c._from.x) * ex;
    const z  = c._from.z + (c._land.z - c._from.z) * ex;
    // Vertical: linear blend + sin arc (overshoot then fall).
    const baseY = c._from.y + (c._land.y - c._from.y) * k;
    const arcY  = Math.sin(k * Math.PI) * CFG.shootArcHeight;
    c.group.position.set(x, baseY + arcY, z);
    // Tumble: peaks at mid-flight, settles to landing tilt.
    c.group.rotation.z = Math.sin(k * Math.PI) * 0.28 + c._jitterRot * k;
    c.group.rotation.x = Math.sin(k * Math.PI) * 0.12;
  }

  // ---- PACK_EXIT -------------------------------------------------------------

  _tickPackExit(dt) {
    const k = Math.min(this.timer / CFG.packExitDur, 1);
    if (this.pack?.group) {
      const e       = easeInOut(k);
      const startY  = this._packExitStartY ?? 0;
      // Continue sliding from wherever shoot-out left off → fully off-screen.
      this.pack.group.position.y    = startY + (-4.2 - startY) * e;
      this.pack.group.scale.setScalar(1 - e * 0.35);
    }
    if (k >= 1) {
      // Compute row positions now we have a stable camera aspect.
      const slots = this._computeRowSlots();
      this.cards.forEach((c, i) => {
        c._slot      = slots[i].pos;
        c._slotScale = slots[i].scale;
      });
      this.phase = PH.ARRANGE;
      this.timer = 0;
    }
  }

  // ---- ARRANGE ---------------------------------------------------------------

  _tickArrange(dt) {
    let allInRow = true;

    for (let i = 0; i < this.cards.length; i++) {
      const c     = this.cards[i];
      const delay = i * CFG.arrangeStagger;

      if (c._cs === CS.LANDED) {
        if (this.timer >= delay) {
          // Card starts sliding to its row slot.
          c._cs        = CS.SETTLING;
          c._timer     = 0;
          c._from.copy(c.group.position);
          c._fromScale = c.group.scale.x;
          c._fromRotZ  = c.group.rotation.z;
        }
        allInRow = false;

      } else if (c._cs === CS.SETTLING) {
        c._timer += dt;
        const k = Math.min(c._timer / CFG.arrangeDur, 1);
        // easeOutBack gives the snap-into-place overshoot.
        c.group.position.lerpVectors(c._from, c._slot, easeOutBack(k, 1.3));
        c.group.scale.setScalar(
          c._fromScale + (c._slotScale - c._fromScale) * easeOut(k),
        );
        c.group.rotation.z = c._fromRotZ * (1 - easeOut(k));
        c.group.rotation.x = 0;
        if (k >= 1) {
          c._cs = CS.IN_ROW;
          c.group.position.copy(c._slot);
          c.group.scale.setScalar(c._slotScale);
          c.group.rotation.set(0, 0, 0);
        } else {
          allInRow = false;
        }

      } else if (c._cs !== CS.IN_ROW && c._cs !== CS.FLIPPING && c._cs !== CS.REVEALED) {
        allInRow = false;
      }
    }

    if (allInRow) {
      this.phase = PH.ROW_IDLE;
      this.timer = 0;
      window.dispatchEvent(new CustomEvent('reveal:rowReady', {
        detail: { total: this.cards.length },
      }));
    }
  }

  // ---- ROW_IDLE --------------------------------------------------------------

  _tickRowIdle(dt, time) {
    for (const c of this.cards) {
      c.setTime(time);

      if (c._cs === CS.FLIPPING) {
        c._timer += dt;
        const k = Math.min(c._timer / CFG.flipDur, 1);
        const e = easeInOut(k);
        c.flip.rotation.y = Math.PI * (1 - e);

        // Scale pops up to peak at the reveal midpoint then returns to normal.
        const pop = k < 0.5
          ? 1 + (CFG.flipScalePeak - 1) * (k * 2)
          : CFG.flipScalePeak - (CFG.flipScalePeak - 1) * ((k - 0.5) * 2);
        c.group.scale.setScalar(c._slotScale * pop);

        if (!c._revealFired && e >= 0.5) this._fireReveal(c);

        if (k >= 1) {
          c._cs             = CS.REVEALED;
          c.flip.rotation.y = 0;
          c.group.scale.setScalar(c._slotScale);
          c._holoTimer      = 0;
        }

      } else if (c._cs === CS.REVEALED) {
        c._holoTimer = (c._holoTimer ?? 0) + dt;
        const ramp = Math.min(c._holoTimer / 0.5, 1);
        c.setHoloIntensity(c.rarity.holoIntensity * ramp);
        c.setHoloTilt(
          Math.sin(time * 1.4) * 0.4,
          Math.cos(time * 1.1) * 0.25,
        );
        if (c.rarity.glow !== 'none') {
          c.setGlow(0.4 + 0.3 * Math.sin(time * 3));
        }
      }
    }

    if (this._awaitingFinish) {
      this._finishTimer += dt;
      if (this._finishTimer >= CFG.summaryDelay) {
        this._awaitingFinish = false;
        this._finish();
      }
    }
  }

  // ---- fx helpers ------------------------------------------------------------

  _haptic(tier) {
    const pat = {
      COMMON:       0,
      UNCOMMON:     8,
      RARE:         [12, 20],
      ULTRA_RARE:   [10, 30, 10, 40],
      SECRET_RARE:  [20, 40, 20, 60, 30, 90],
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

// Rarity signaling system — the single source of truth for how each tier
// looks, sounds, and paces. Every reveal beat (glow hold, flip speed, flash,
// particles, stinger, auto-flip) reads from this table so tuning one tier is
// a one-line change.
//
// Tiers are the 5 NORMALIZED tiers used app-wide. Adapters map their native
// rarity strings onto these (see cardSource.js); nothing downstream of an
// adapter ever sees a game-specific rarity.

export const TIER = {
  COMMON: 'COMMON',
  UNCOMMON: 'UNCOMMON',
  RARE: 'RARE',
  ULTRA_RARE: 'ULTRA_RARE',
  SECRET_RARE: 'SECRET_RARE',
};

// Ordered weakest → strongest. Useful for comparisons and tallies.
export const TIER_ORDER = [
  TIER.COMMON,
  TIER.UNCOMMON,
  TIER.RARE,
  TIER.ULTRA_RARE,
  TIER.SECRET_RARE,
];

export function tierRank(tier) {
  const i = TIER_ORDER.indexOf(tier);
  return i < 0 ? 0 : i;
}

// Is this tier a "hit" worth celebrating? (Rare and above.)
export function isHit(tier) {
  return tierRank(tier) >= tierRank(TIER.RARE);
}

// ---------------------------------------------------------------------------
// The signaling table. Mirrors PLAN.md exactly. Durations in seconds.
// `flash` is the screen-flash style; `particles` the burst preset; `stinger`
// the SoundManager method name; `autoFlip` whether commons-style auto-advance
// applies (false = the user must tap to flip, building suspense on hits).
// ---------------------------------------------------------------------------
export const RARITY = {
  [TIER.COMMON]: {
    tier: TIER.COMMON,
    label: 'Common',
    short: 'C',
    color: 0x9aa0a6,          // neutral grey
    colorCss: '#9aa0a6',
    glow: 'none',             // no pre-flip glow
    glowHold: 0.5,            // seconds the back glow holds before flip
    flipDur: 0.3,             // 180° flip duration
    flash: 'none',
    particles: 'none',
    stinger: 'stCommon',
    autoFlip: true,
    holoIntensity: 0.0,
  },
  [TIER.UNCOMMON]: {
    tier: TIER.UNCOMMON,
    label: 'Uncommon',
    short: 'U',
    color: 0xc7ccd1,          // silver
    colorCss: '#c7ccd1',
    glow: 'silver-pulse',
    glowHold: 0.8,
    flipDur: 0.4,
    flash: 'none',
    particles: 'sparkle',
    stinger: 'stUncommon',
    autoFlip: true,
    holoIntensity: 0.15,
  },
  [TIER.RARE]: {
    tier: TIER.RARE,
    label: 'Rare',
    short: 'R',
    color: 0xffd24a,          // gold
    colorCss: '#ffd24a',
    glow: 'gold-glow',
    glowHold: 1.2,
    flipDur: 0.5,
    flash: 'white-edge',
    particles: 'gold-dust',
    stinger: 'stRare',
    autoFlip: false,          // tap to flip — anticipation
    holoIntensity: 0.55,
  },
  [TIER.ULTRA_RARE]: {
    tier: TIER.ULTRA_RARE,
    label: 'Ultra Rare',
    short: 'UR',
    color: 0x9b6bff,          // prismatic base (cycles in shader)
    colorCss: '#b58cff',
    glow: 'prismatic-shift',
    glowHold: 1.5,
    flipDur: 0.8,
    flash: 'full-white',
    particles: 'prismatic-cascade',
    stinger: 'stUltra',
    autoFlip: false,
    holoIntensity: 0.85,
  },
  [TIER.SECRET_RARE]: {
    tier: TIER.SECRET_RARE,
    label: 'Secret Rare',
    short: 'SR',
    color: 0xff4ad2,          // rainbow base (cycles in shader)
    colorCss: '#ff7ae0',
    glow: 'rainbow-cycle',
    glowHold: 2.5,
    flipDur: 1.2,
    flash: 'full-darken',
    particles: 'explosion',
    stinger: 'stSecret',
    autoFlip: false,
    holoIntensity: 1.0,
  },
};

export function rarityOf(tier) {
  return RARITY[tier] ?? RARITY[TIER.COMMON];
}

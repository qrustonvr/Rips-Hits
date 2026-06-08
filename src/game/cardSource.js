// CardSource adapter.
//
// Reads pack definitions from src/data/packs/*.json (via cards.js).
// Each pack has a `pool` object keyed by normalized TIER strings, with arrays
// of { id, name } card stubs.
//
// At pick time we return a card object with art: null — the reveal controller
// calls tcgdex.js after the flip to load the live image + price.

import { PACKS } from '../data/cards.js';
import { TIER } from './rarity.js';

// ---------------------------------------------------------------------------
// Rarity normalization
// Maps TCGdex rarity strings → our 5 normalized TIER values.
// ---------------------------------------------------------------------------
const RARITY_MAP = {
  // Common
  'common':                    TIER.COMMON,
  // Uncommon
  'uncommon':                  TIER.UNCOMMON,
  // Rare
  'rare':                      TIER.RARE,
  'rare holo':                 TIER.RARE,
  'rare holo v':               TIER.RARE,
  'rare holo vstar':           TIER.RARE,
  'rare holo vmax':            TIER.RARE,
  'rare holo lv.x':            TIER.RARE,
  'rare holo ex':              TIER.RARE,
  'rare holo gx':              TIER.RARE,
  'amazing rare':              TIER.RARE,
  // Ultra Rare
  'double rare':               TIER.ULTRA_RARE,
  'ultra rare':                TIER.ULTRA_RARE,
  'rare ultra':                TIER.ULTRA_RARE,
  'rare rainbow':              TIER.ULTRA_RARE,
  'rare prism star':           TIER.ULTRA_RARE,
  'radiant rare':              TIER.ULTRA_RARE,
  'trainer gallery rare holo': TIER.ULTRA_RARE,
  'ace spec rare':             TIER.ULTRA_RARE,
  // Secret Rare
  'illustration rare':         TIER.SECRET_RARE,
  'special illustration rare': TIER.SECRET_RARE,
  'hyper rare':                TIER.SECRET_RARE,
  'rare secret':               TIER.SECRET_RARE,
  'rare shiny':                TIER.SECRET_RARE,
  'rare shiny gx':             TIER.SECRET_RARE,
  'shiny rare':                TIER.SECRET_RARE,
  'shiny ultra rare':          TIER.SECRET_RARE,
};

export function normalizeRarity(rawString) {
  if (!rawString) return TIER.COMMON;
  const key = String(rawString).toLowerCase().trim();
  return RARITY_MAP[key] ?? TIER.COMMON;
}

// ---------------------------------------------------------------------------
// Holo pattern assigned when tier has no card-specific override.
// ---------------------------------------------------------------------------
const DEFAULT_HOLO = {
  [TIER.COMMON]:      null,
  [TIER.UNCOMMON]:    'cracked-ice',
  [TIER.RARE]:        'cosmos',
  [TIER.ULTRA_RARE]:  'full-art',
  [TIER.SECRET_RARE]: 'vertical-beam',
};

// Plausible base price by tier (shown immediately; overwritten by live price).
function estPrice(tier) {
  const ranges = {
    [TIER.COMMON]:      [0.05, 0.4],
    [TIER.UNCOMMON]:    [0.25, 1.5],
    [TIER.RARE]:        [1.0,  12],
    [TIER.ULTRA_RARE]:  [8,    80],
    [TIER.SECRET_RARE]: [40,   400],
  };
  const [lo, hi] = ranges[tier] ?? ranges[TIER.COMMON];
  return +(lo + Math.random() * (hi - lo)).toFixed(2);
}

// ---------------------------------------------------------------------------
// Build a rarity-indexed pool from a pack definition's `pool` buckets.
// Each entry in a bucket is { id, name }; we enrich with tier + defaults.
// ---------------------------------------------------------------------------
function buildPool(pack) {
  const pool = {
    [TIER.COMMON]:      [],
    [TIER.UNCOMMON]:    [],
    [TIER.RARE]:        [],
    [TIER.ULTRA_RARE]:  [],
    [TIER.SECRET_RARE]: [],
  };

  for (const [tierKey, cards] of Object.entries(pack.pool ?? {})) {
    const tier = TIER[tierKey] ?? TIER.COMMON;
    for (const c of cards) {
      pool[tier].push({
        id:          c.id,
        game:        pack.game,
        name:        c.name,
        setId:       pack.id,
        number:      c.id.split('-').pop(),
        tier,
        art:         null,          // loaded at runtime via tcgdex.js
        holoPattern: DEFAULT_HOLO[tier],
        basePrice:   estPrice(tier),
      });
    }
  }

  return pool;
}

// ---------------------------------------------------------------------------
// Internal caches
// ---------------------------------------------------------------------------
const _packMap   = {};   // packId → pack definition
const _poolCache = {};   // packId → built pool

// Index packs by their id field (used as "game" key throughout the app).
for (const pack of PACKS) {
  _packMap[pack.id] = pack;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export const CardSource = {
  // All packs as { id, name, game, cardsPerPack, packTexture, releaseDate }.
  getSets() {
    return PACKS.map(({ id, name, game, cardsPerPack, packTexture, releaseDate }) => ({
      id, name, game, cardsPerPack, packTexture, releaseDate,
    }));
  },

  getSet(packId) {
    const p = _packMap[packId];
    if (!p) return null;
    const { id, name, game, cardsPerPack, packTexture, releaseDate } = p;
    return { id, name, game, cardsPerPack, packTexture, releaseDate };
  },

  // Pool for a pack, keyed by normalized tier. Cached per session.
  getPool(packId) {
    if (!_poolCache[packId]) {
      const pack = _packMap[packId];
      if (!pack) return null;
      _poolCache[packId] = buildPool(pack);
    }
    return _poolCache[packId];
  },

  // Pick a random card of a given tier from a pack (clone so callers can mutate).
  pick(packId, tier) {
    const pool = this.getPool(packId);
    if (!pool) return null;
    const bucket = pool[tier];
    if (!bucket || bucket.length === 0) return null;
    const c = bucket[(Math.random() * bucket.length) | 0];
    return { ...c };
  },
};

// CardSource adapter.
//
// The rest of the app talks ONLY to this module — it never sees a
// game-specific rarity string. Each game registers a native-normalized
// rarity map here, and the adapter exposes a uniform pool keyed by the 5
// normalized tiers. Swapping in real Pokemon / One Piece scans later means
// dropping art + registry rows; nothing downstream changes.

import { SETS, CARDS } from '../data/cards.js';
import { TIER } from './rarity.js';

// Per-game rarity maps: native string (lowercase) -> normalized TIER.
// Covers real TCG print strings so real card data drops in without code changes.
const RARITY_MAPS = {
  pokemon: {
    'common':        TIER.COMMON,
    'uncommon':      TIER.UNCOMMON,
    'rare':          TIER.RARE,
    'rare holo':     TIER.RARE,
    'holo':          TIER.RARE,
    'rare-holo':     TIER.RARE,
    'ex':            TIER.ULTRA_RARE,
    'gx':            TIER.ULTRA_RARE,
    'v':             TIER.ULTRA_RARE,
    'vmax':          TIER.ULTRA_RARE,
    'vstar':         TIER.ULTRA_RARE,
    'ultra':         TIER.ULTRA_RARE,
    'ultra rare':    TIER.ULTRA_RARE,
    'secret':        TIER.SECRET_RARE,
    'secret rare':   TIER.SECRET_RARE,
    'alt-art':       TIER.SECRET_RARE,
    'alt art':       TIER.SECRET_RARE,
    'gold':          TIER.SECRET_RARE,
    'rainbow':       TIER.SECRET_RARE,
    'rainbow rare':  TIER.SECRET_RARE,
  },
  onepiece: {
    'common':        TIER.COMMON,
    'uncommon':      TIER.UNCOMMON,
    'rare':          TIER.RARE,
    'super rare':    TIER.ULTRA_RARE,
    'super-rare':    TIER.ULTRA_RARE,
    'special rare':  TIER.ULTRA_RARE,
    'special-rare':  TIER.ULTRA_RARE,
    'ultra':         TIER.ULTRA_RARE,
    'secret rare':   TIER.SECRET_RARE,
    'secret':        TIER.SECRET_RARE,
    'leader rare':   TIER.SECRET_RARE,
    'leader-rare':   TIER.SECRET_RARE,
  },
};

// Fallback map for simplified internal strings or unknown games.
const RARITY_MAP_FALLBACK = {
  'common':   TIER.COMMON,
  'uncommon': TIER.UNCOMMON,
  'rare':     TIER.RARE,
  'holo':     TIER.RARE,
  'ultra':    TIER.ULTRA_RARE,
  'secret':   TIER.SECRET_RARE,
};

// normalizeRarity(game, rawString) - game-aware, matches TASKS.MD Phase 2 spec.
// Also accepts normalizeRarity(rawString) for backward compat (single-arg form).
export function normalizeRarity(gameOrNative, rawString) {
  if (rawString === undefined) {
    const key = String(gameOrNative).toLowerCase().trim();
    return RARITY_MAP_FALLBACK[key] ?? TIER.COMMON;
  }
  const map = RARITY_MAPS[gameOrNative] ?? RARITY_MAP_FALLBACK;
  const key = String(rawString).toLowerCase().trim();
  return map[key] ?? RARITY_MAP_FALLBACK[key] ?? TIER.COMMON;
}

// Holo preset assigned to a tier when a card doesn't specify one.
const DEFAULT_HOLO = {
  [TIER.COMMON]: null,
  [TIER.UNCOMMON]: 'cracked-ice',
  [TIER.RARE]: 'cosmos',
  [TIER.ULTRA_RARE]: 'full-art',
  [TIER.SECRET_RARE]: 'vertical-beam',
};

// Flavor names so procedurally-padded pulls have variety.
const FLAVOR = {
  pokemon: ['Emberling', 'Tidewhisk', 'Voltfang', 'Mosswing', 'Cindertail',
            'Frostnip', 'Gustling', 'Petalux', 'Quartzback', 'Nimbufin'],
  onepiece: ['Gale Cutter', 'Iron Vow', 'Salt Reaver', 'Tide Marshal',
             'Ember Oath', 'Storm Caller', 'Bone Captain', 'Coral Duelist'],
};

function flavorName(game, tier, i) {
  const pool = FLAVOR[game] ?? FLAVOR.pokemon;
  const base = pool[i % pool.length];
  const suffix = { [TIER.RARE]: ' (R)', [TIER.ULTRA_RARE]: ' (UR)', [TIER.SECRET_RARE]: ' (SR)' }[tier] ?? '';
  return base + suffix;
}

// Build a per-game pool grouped by normalized tier. Real registry cards come
// first; we then pad each tier with procedural placeholders so every slot in
// a pack can always be filled with variety.
function buildPool(game) {
  const pool = {
    [TIER.COMMON]: [], [TIER.UNCOMMON]: [], [TIER.RARE]: [],
    [TIER.ULTRA_RARE]: [], [TIER.SECRET_RARE]: [],
  };

  for (const c of CARDS) {
    if (c.game !== game) continue;
    const tier = normalizeRarity(c.game, c.rarity);
    pool[tier].push({
      id: c.id,
      game,
      name: c.name,
      setId: c.setId ?? game,
      number: c.number ?? null,
      tier,
      art: c.art ?? null,
      holoPattern: c.holoPattern ?? DEFAULT_HOLO[tier],
      basePrice: estPrice(tier),
    });
  }

  // Pad so each tier has a reasonable bench of unique cards.
  const want = {
    [TIER.COMMON]: 16, [TIER.UNCOMMON]: 10, [TIER.RARE]: 8,
    [TIER.ULTRA_RARE]: 5, [TIER.SECRET_RARE]: 3,
  };
  for (const tier of Object.keys(want)) {
    let i = pool[tier].length;
    while (pool[tier].length < want[tier]) {
      pool[tier].push({
        id: game + '-' + tier.toLowerCase() + '-' + i,
        game,
        name: flavorName(game, tier, i),
        setId: game,
        number: null,
        tier,
        art: null,
        holoPattern: DEFAULT_HOLO[tier],
        basePrice: estPrice(tier),
      });
      i++;
    }
  }
  return pool;
}

// Plausible market price by tier (used until a real price source is wired in).
function estPrice(tier) {
  const ranges = {
    [TIER.COMMON]: [0.05, 0.4],
    [TIER.UNCOMMON]: [0.25, 1.5],
    [TIER.RARE]: [1.0, 12],
    [TIER.ULTRA_RARE]: [8, 80],
    [TIER.SECRET_RARE]: [40, 400],
  };
  const [lo, hi] = ranges[tier] ?? ranges[TIER.COMMON];
  return +(lo + Math.random() * (hi - lo)).toFixed(2);
}

const _poolCache = {};

export const CardSource = {
  getSets() {
    return Object.entries(SETS).map(([id, s]) => ({ id, ...s }));
  },

  getSet(game) {
    const s = SETS[game];
    return s ? { id: game, ...s } : null;
  },

  // Pool for a game, grouped by normalized tier. Cached per session.
  getPool(game) {
    if (!_poolCache[game]) _poolCache[game] = buildPool(game);
    return _poolCache[game];
  },

  // Pick a random card of a given tier (clones so callers can mutate freely).
  pick(game, tier) {
    const bucket = this.getPool(game)[tier];
    if (!bucket || bucket.length === 0) return null;
    const c = bucket[(Math.random() * bucket.length) | 0];
    return { ...c };
  },
};

// CardSource adapter.
//
// The rest of the app talks ONLY to this module — it never sees a
// game-specific rarity string. Each game registers a native→normalized
// rarity map here, and the adapter exposes a uniform pool keyed by the 5
// normalized tiers. Swapping in real Pokémon / One Piece scans later means
// dropping art + registry rows; nothing downstream changes.

import { SETS, CARDS } from '../data/cards.js';
import { TIER } from './rarity.js';

// Native rarity strings (as they appear in data/cards.js) → normalized tier.
const RARITY_MAP = {
  common: TIER.COMMON,
  uncommon: TIER.UNCOMMON,
  rare: TIER.RARE,
  holo: TIER.RARE,          // holo rare reads as RARE in the normalized model
  ultra: TIER.ULTRA_RARE,
  secret: TIER.SECRET_RARE,
};

export function normalizeRarity(native) {
  return RARITY_MAP[native] ?? TIER.COMMON;
}

// Holo preset assigned to a tier when a card doesn't specify one. Keeps the
// shader busy on hits even for placeholder art.
const DEFAULT_HOLO = {
  [TIER.COMMON]: null,
  [TIER.UNCOMMON]: 'cracked-ice',
  [TIER.RARE]: 'cosmos',
  [TIER.ULTRA_RARE]: 'full-art',
  [TIER.SECRET_RARE]: 'vertical-beam',
};

// Flavor names so placeholder pulls don't all read "Placeholder Common".
const FLAVOR = {
  pokemon: ['Emberling', 'Tidewhisk', 'Voltfang', 'Mosswing', 'Cindertail',
            'Frostnip', 'Gustling', 'Petalux', 'Quartzback', 'Nimbufin'],
  onepiece: ['Gale Cutter', 'Iron Vow', 'Salt Reaver', 'Tide Marshal',
             'Ember Oath', 'Storm Caller', 'Bone Captain', 'Coral Duelist'],
};

function flavorName(game, tier, i) {
  const pool = FLAVOR[game] ?? FLAVOR.pokemon;
  const base = pool[i % pool.length];
  const suffix = { [TIER.RARE]: ' ◆', [TIER.ULTRA_RARE]: ' ★', [TIER.SECRET_RARE]: ' ✦' }[tier] ?? '';
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
    const tier = normalizeRarity(c.rarity);
    pool[tier].push({
      id: c.id,
      game,
      name: c.name,
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
        id: `${game}-${tier.toLowerCase()}-${i}`,
        game,
        name: flavorName(game, tier, i),
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

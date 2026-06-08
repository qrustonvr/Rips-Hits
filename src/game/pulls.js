// Pull engine — turns "open a pack of game X" into an ordered list of cards.
//
// A pack is a sequence of SLOTS. Early slots are filler (commons/uncommons);
// the final slot is the "hit slot" with the juicy odds. Ordering matters: the
// reveal sequence walks the array in order, so we sort commons -> rare last to
// build toward the payoff. Fast-open just calls openPack() N times.

import { CardSource } from './cardSource.js';
import { TIER, tierRank } from './rarity.js';

// Weighted random pick from a {tier: weight} map.
function rollTier(weights) {
  const entries = Object.entries(weights);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [tier, w] of entries) {
    r -= w;
    if (r <= 0) return tier;
  }
  return entries[0][0];
}

// Slot odds. `filler` slots make up the bulk; the single `hit` slot carries
// the dream. Tuned so a hit (Rare+) lands most packs but UR/SR stay special.
const FILLER_WEIGHTS = {
  [TIER.COMMON]: 70,
  [TIER.UNCOMMON]: 28,
  [TIER.RARE]: 2,
};

const HIT_WEIGHTS = {
  [TIER.RARE]: 74,
  [TIER.ULTRA_RARE]: 22,
  [TIER.SECRET_RARE]: 4,
};

export function openPack(game) {
  const set = CardSource.getSet(game);
  const count = set?.cardsPerPack ?? 10;

  const cards = [];
  // All but the last slot are filler.
  for (let i = 0; i < count - 1; i++) {
    cards.push(drawCard(game, rollTier(FILLER_WEIGHTS)));
  }
  // Final slot is the guaranteed hit.
  cards.push(drawCard(game, rollTier(HIT_WEIGHTS)));

  // Build toward the payoff: weakest first, strongest last.
  cards.sort((a, b) => tierRank(a.tier) - tierRank(b.tier));

  return cards;
}

let _uidSeq = 0;

function drawCard(game, tier) {
  const c = CardSource.pick(game, tier) ?? {
    id: `${game}-fallback-${Math.random().toString(36).slice(2, 7)}`,
    game, name: 'Mystery Card', tier, art: null, holoPattern: null, basePrice: 0,
  };
  // Final per-pull instance fields. Counter guarantees uid uniqueness even
  // for many cards drawn within the same millisecond.
  c.uid = `${c.id}-${Date.now().toString(36)}-${(_uidSeq++).toString(36)}`;
  c.price = +(c.basePrice * (0.85 + Math.random() * 0.4)).toFixed(2);
  return c;
}

// Fast-open: open N packs at once, returning a flat tally + per-pack groups.
export function openManyPacks(game, n) {
  const packs = [];
  for (let i = 0; i < n; i++) packs.push(openPack(game));
  const flat = packs.flat();
  return { packs, flat, tally: tallyByTier(flat) };
}

export function tallyByTier(cards) {
  const t = {};
  for (const c of cards) t[c.tier] = (t[c.tier] ?? 0) + 1;
  return t;
}

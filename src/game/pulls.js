// Pull engine — pure per-card weighted draws (no fixed rarity slots).
// Each card's weight is determined by its tier; rarer cards have lower weight.
// This removes guaranteed rarity slots so every pull is a true random draw.

import { CardSource } from './cardSource.js';
import { TIER, tierRank } from './rarity.js';

// Weight per tier — lower = harder to pull.
export const TIER_WEIGHT = {
  [TIER.COMMON]:      100,
  [TIER.UNCOMMON]:    28,
  [TIER.RARE]:        6.5,
  [TIER.ULTRA_RARE]:  1.5,
  [TIER.SECRET_RARE]: 0.3,
};

// Build a flat weighted candidate list from the entire pool.
function buildCandidates(packId) {
  const pool = CardSource.getPool(packId);
  if (!pool) return [];
  const candidates = [];
  for (const [tier, cards] of Object.entries(pool)) {
    const w = TIER_WEIGHT[tier] ?? 1;
    for (const card of cards) candidates.push({ card: { ...card }, weight: w });
  }
  return candidates;
}

// Weighted random pick from the candidate list.
function weightedPick(candidates) {
  const total = candidates.reduce((s, c) => s + c.weight, 0);
  let r = Math.random() * total;
  for (const { card, weight } of candidates) {
    r -= weight;
    if (r <= 0) return { ...card };
  }
  return { ...candidates[candidates.length - 1].card };
}

let _uidSeq = 0;
function finalizeCard(card) {
  card.uid   = `${card.id}-${Date.now().toString(36)}-${(_uidSeq++).toString(36)}`;
  card.price = +(card.basePrice * (0.85 + Math.random() * 0.4)).toFixed(2);
  return card;
}

// Open a single pack — N weighted draws, sorted weakest→strongest for reveal.
export function openPack(game) {
  const set        = CardSource.getSet(game);
  const count      = set?.cardsPerPack ?? 5;
  const candidates = buildCandidates(game);

  if (!candidates.length) return [];

  const cards = [];
  for (let i = 0; i < count; i++) {
    cards.push(finalizeCard(weightedPick(candidates)));
  }
  cards.sort((a, b) => tierRank(a.tier) - tierRank(b.tier));
  return cards;
}

// Open N packs at once (for multi-pack opening).
export function openManyPacks(game, n = 1) {
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

// ---------------------------------------------------------------------------
// Pull rate calculation — per-card probability in a single pack opening.
// Returns array sorted by pullRate ascending (rarest first for display).
// ---------------------------------------------------------------------------
export function getPullRates(packId) {
  const set        = CardSource.getSet(packId);
  const cardsPerPack = set?.cardsPerPack ?? 5;
  const candidates = buildCandidates(packId);
  if (!candidates.length) return [];

  const total = candidates.reduce((s, c) => s + c.weight, 0);

  return candidates.map(({ card, weight }) => {
    const perDraw    = weight / total;
    // P(at least one in cardsPerPack draws)
    const perPack    = 1 - Math.pow(1 - perDraw, cardsPerPack);
    return { ...card, pullRate: perPack };
  }).sort((a, b) => a.pullRate - b.pullRate);  // rarest first
}

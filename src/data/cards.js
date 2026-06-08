// Card database. Real card art drops into public/cards/<game>/ and gets
// registered here. holoMask is optional (white = holo region); without it,
// holoPattern picks a preset shader pattern.
//
// rarity (raw game string): common | uncommon | rare | rare-holo | ultra | secret
//   Pokemon also accepts: ex | gx | v | vmax | vstar | alt-art | gold
//   One Piece also accepts: super-rare | special-rare | leader-rare
//
// setId: matches the key in SETS (same as game for now; will differ when
//   multiple sets per game are supported).

export const SETS = {
  pokemon: {
    id: 'pokemon',
    name: 'Pokemon TCG',
    game: 'pokemon',
    packTexture: '/packs/pokemon.png',
    cardsPerPack: 10,
    cardCount: 10,
    releaseDate: '2024-01-15',
  },
  onepiece: {
    id: 'onepiece',
    name: 'One Piece Card Game',
    game: 'onepiece',
    packTexture: '/packs/onepiece.png',
    cardsPerPack: 12,
    cardCount: 10,
    releaseDate: '2024-03-08',
  },
};

export const CARDS = [
  // --- Pokemon TCG (10 cards, all 5 rarity tiers covered) ---
  { id: 'pkm-001', setId: 'pokemon', game: 'pokemon', number: '001', name: 'Emberling',     rarity: 'common',   art: null, holoPattern: null },
  { id: 'pkm-002', setId: 'pokemon', game: 'pokemon', number: '002', name: 'Tidewhisk',     rarity: 'common',   art: null, holoPattern: null },
  { id: 'pkm-003', setId: 'pokemon', game: 'pokemon', number: '003', name: 'Voltfang',      rarity: 'common',   art: null, holoPattern: null },
  { id: 'pkm-004', setId: 'pokemon', game: 'pokemon', number: '004', name: 'Mosswing',      rarity: 'common',   art: null, holoPattern: null },
  { id: 'pkm-005', setId: 'pokemon', game: 'pokemon', number: '005', name: 'Frostnip',      rarity: 'uncommon', art: null, holoPattern: null },
  { id: 'pkm-006', setId: 'pokemon', game: 'pokemon', number: '006', name: 'Gustling',      rarity: 'uncommon', art: null, holoPattern: null },
  { id: 'pkm-007', setId: 'pokemon', game: 'pokemon', number: '007', name: 'Petalux',       rarity: 'rare-holo',art: null, holoPattern: 'cosmos' },
  { id: 'pkm-008', setId: 'pokemon', game: 'pokemon', number: '008', name: 'Quartzback',    rarity: 'rare-holo',art: null, holoPattern: 'cosmos' },
  { id: 'pkm-009', setId: 'pokemon', game: 'pokemon', number: '009', name: 'Cindertail ex', rarity: 'ex',       art: null, holoPattern: 'full-art' },
  { id: 'pkm-010', setId: 'pokemon', game: 'pokemon', number: '010', name: 'Nimbufin Gold', rarity: 'gold',     art: null, holoPattern: 'vertical-beam' },

  // --- One Piece Card Game (10 cards, all 5 rarity tiers covered) ---
  { id: 'op-001', setId: 'onepiece', game: 'onepiece', number: '001', name: 'Gale Cutter',   rarity: 'common',     art: null, holoPattern: null },
  { id: 'op-002', setId: 'onepiece', game: 'onepiece', number: '002', name: 'Iron Vow',       rarity: 'common',     art: null, holoPattern: null },
  { id: 'op-003', setId: 'onepiece', game: 'onepiece', number: '003', name: 'Salt Reaver',    rarity: 'common',     art: null, holoPattern: null },
  { id: 'op-004', setId: 'onepiece', game: 'onepiece', number: '004', name: 'Tide Marshal',   rarity: 'common',     art: null, holoPattern: null },
  { id: 'op-005', setId: 'onepiece', game: 'onepiece', number: '005', name: 'Ember Oath',     rarity: 'uncommon',   art: null, holoPattern: null },
  { id: 'op-006', setId: 'onepiece', game: 'onepiece', number: '006', name: 'Storm Caller',   rarity: 'uncommon',   art: null, holoPattern: null },
  { id: 'op-007', setId: 'onepiece', game: 'onepiece', number: '007', name: 'Bone Captain',   rarity: 'rare',       art: null, holoPattern: 'cosmos' },
  { id: 'op-008', setId: 'onepiece', game: 'onepiece', number: '008', name: 'Coral Duelist',  rarity: 'rare',       art: null, holoPattern: 'cosmos' },
  { id: 'op-009', setId: 'onepiece', game: 'onepiece', number: '009', name: 'Void Sovereign', rarity: 'super-rare', art: null, holoPattern: 'full-art' },
  { id: 'op-010', setId: 'onepiece', game: 'onepiece', number: '010', name: 'Sea Tyrant',     rarity: 'leader-rare',art: null, holoPattern: 'vertical-beam' },
];

// Convenience: get all static cards for a given setId (async signature for
// forward-compatibility with Phase 10 price fetching).
export async function getCardsBySet(setId) {
  return CARDS.filter((c) => c.setId === setId);
}

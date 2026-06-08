// Card database. Real card art drops into public/cards/<game>/ and gets
// registered here. holoMask is optional (white = holo region); without it,
// holoPattern picks a preset shader pattern.
//
// rarity: common | uncommon | rare | holo | ultra | secret

export const SETS = {
  pokemon: {
    name: 'Pokémon TCG',
    packTexture: '/packs/pokemon.png',
    cardsPerPack: 10,
    // pull weights per slot are defined in pulls.js
  },
  onepiece: {
    name: 'One Piece Card Game',
    packTexture: '/packs/onepiece.png',
    cardsPerPack: 12,
  },
};

export const CARDS = [
  // Placeholder entries until real scans arrive.
  { id: 'pkm-001', game: 'pokemon', name: 'Placeholder Common',  rarity: 'common', art: null, holoPattern: null },
  { id: 'pkm-002', game: 'pokemon', name: 'Placeholder Holo',    rarity: 'holo',   art: null, holoPattern: 'cosmos' },
  { id: 'pkm-003', game: 'pokemon', name: 'Placeholder Ultra',   rarity: 'ultra',  art: null, holoPattern: 'full-art' },
  { id: 'op-001',  game: 'onepiece', name: 'Placeholder Common', rarity: 'common', art: null, holoPattern: null },
  { id: 'op-002',  game: 'onepiece', name: 'Placeholder SR',     rarity: 'ultra',  art: null, holoPattern: 'vertical-beam' },
];

// Collection persistence — localStorage for the jam.
const KEY = 'ripsandhits.collection.v1';

export function getCollection() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? [];
  } catch {
    return [];
  }
}

export function addCards(cards) {
  const all = getCollection();
  const ids = new Set(all.map((c) => c.id));
  for (const card of cards) {
    all.push({ ...card, pulledAt: Date.now(), isNew: !ids.has(card.id) });
  }
  localStorage.setItem(KEY, JSON.stringify(all));
}

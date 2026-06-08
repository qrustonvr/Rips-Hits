// TCGdex API client — fetches live card images and market prices.
//
// Pack definitions (src/data/packs/*.json) store only card IDs + names.
// This module resolves images and prices at runtime so:
//   • Images are always the latest scan from TCGdex's CDN.
//   • Prices reflect current market data.
//   • Collection cards work even after their source pack is retired.
//
// Cache: per-card localStorage entry, 24 h TTL.
// Image URL is part of the same cache entry — it rarely changes and saves
// a round-trip on repeat views.

const BASE = 'https://api.tcgdex.net/v2/en';
const PRICE_TTL  = 24 * 60 * 60 * 1000;   // 24 h — prices change daily
const IMAGE_TTL  = 7  * 24 * 60 * 60 * 1000; // 7 days — image URLs are stable

// ---------------------------------------------------------------------------
// fetchCardData(cardId) → { id, name, image, rarity, pricing } | null
//
// Returns the full TCGdex card object, served from cache when fresh.
// ---------------------------------------------------------------------------
export async function fetchCardData(cardId) {
  if (!cardId) return null;

  const cacheKey = `tcgdex_card_${cardId}`;
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey));
    if (cached) {
      const age = Date.now() - (cached.t ?? 0);
      // Prices valid for 24 h; image URL valid for 7 days.
      // We store both in the same entry and use the shorter TTL for the whole
      // object so prices stay fresh.
      if (age < PRICE_TTL) return cached.data;
    }
  } catch { /* corrupted cache — fall through */ }

  try {
    const res = await fetch(`${BASE}/cards/${cardId}`);
    if (!res.ok) throw new Error(`TCGdex ${res.status}`);
    const data = await res.json();
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ data, t: Date.now() }));
    } catch { /* storage full — non-fatal */ }
    return data;
  } catch (err) {
    console.warn(`[TCGdex] fetchCardData(${cardId}) failed:`, err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// getImageUrl(tcgdexCard, quality?)
//
// Appends /high.webp (600×825) or /low.webp (245×337) to the image base URL.
// Returns null if the card has no image.
// ---------------------------------------------------------------------------
export function getImageUrl(tcgdexCard, quality = 'high') {
  const base = tcgdexCard?.image;
  if (!base) return null;
  return `${base}/${quality}.webp`;
}

// ---------------------------------------------------------------------------
// extractPrice(tcgdexCard) → number | null
//
// Price fallback chain (USD preferred, EUR fallback):
//   TCGPlayer holofoil → TCGPlayer normal → TCGPlayer reverse-holofoil
//   → Cardmarket trend (EUR)
// ---------------------------------------------------------------------------
export function extractPrice(tcgdexCard) {
  if (!tcgdexCard) return null;
  const tcp = tcgdexCard.pricing?.tcgplayer;
  const cm  = tcgdexCard.pricing?.cardmarket;
  return (
    tcp?.holofoil?.marketPrice            ??
    tcp?.['1st-edition-holofoil']?.marketPrice ??
    tcp?.normal?.marketPrice              ??
    tcp?.['reverse-holofoil']?.marketPrice ??
    cm?.trend                              ??
    null
  );
}

// ---------------------------------------------------------------------------
// prefetchCards(cardIds[]) → void
//
// Fire-and-forget warm-up: fetches a list of cards into cache so reveal has
// data ready. Call early (e.g. when the user grabs the pack tab).
// ---------------------------------------------------------------------------
export function prefetchCards(cardIds) {
  for (const id of cardIds) {
    fetchCardData(id).catch(() => {});
  }
}

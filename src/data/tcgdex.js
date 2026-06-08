// TCGdex API client — fetches live card images and market prices.
//
// Pack definitions (src/data/packs/*.json) store only card IDs + names.
// This module resolves images and prices at runtime so:
//   • Images are always the latest scan from TCGdex's CDN.
//   • Prices reflect current market data.
//   • Collection cards work even after their source pack is retired.
//
// Cache: per-card localStorage entry, 24 h TTL.

const BASE = 'https://api.tcgdex.net/v2/en';
const PRICE_TTL = 24 * 60 * 60 * 1000;  // 24 h

// ---------------------------------------------------------------------------
// fetchCardData(cardId) → full TCGdex card object | null
// ---------------------------------------------------------------------------
export async function fetchCardData(cardId) {
  if (!cardId) return null;

  // Check cache first
  const cacheKey = `tcgdex_card_${cardId}`;
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey));
    if (cached && Date.now() - (cached.t ?? 0) < PRICE_TTL) {
      return cached.data;
    }
  } catch { /* corrupted cache — fall through */ }

  // Parse card ID into set + localId for the set-card endpoint (more reliable)
  // e.g. 'sv03.5-1' → setId='sv03.5', localId='1'
  //      'swsh3-136' → setId='swsh3', localId='136'
  const dashIdx = cardId.indexOf('-');
  const setId   = dashIdx > 0 ? cardId.slice(0, dashIdx) : null;
  const localId = dashIdx > 0 ? cardId.slice(dashIdx + 1) : null;

  // Try set/localId endpoint first (avoids URL encoding issues with dots in card ID)
  const urls = setId && localId
    ? [`${BASE}/sets/${setId}/${localId}`, `${BASE}/cards/${cardId}`]
    : [`${BASE}/cards/${cardId}`];

  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[TCGdex] ${url} → ${res.status}`);
        continue;
      }
      const data = await res.json();
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ data, t: Date.now() }));
      } catch { /* storage full */ }
      console.log(`[TCGdex] loaded ${cardId}:`, data.name, data.rarity, '| image:', !!data.image);
      return data;
    } catch (err) {
      console.error(`[TCGdex] fetch failed for ${url}:`, err.message);
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// getImageUrl(tcgdexCard, quality?) → URL string | null
// quality: 'high' (600×825) or 'low' (245×337)
// ---------------------------------------------------------------------------
export function getImageUrl(tcgdexCard, quality = 'high') {
  const base = tcgdexCard?.image;
  if (!base) return null;
  // TCGdex images have no extension — append /{quality}.webp
  return `${base}/${quality}.webp`;
}

// ---------------------------------------------------------------------------
// extractPrice(tcgdexCard) → USD number | null
// Fallback chain: TCGPlayer holofoil → normal → reverse → Cardmarket trend (EUR)
// ---------------------------------------------------------------------------
export function extractPrice(tcgdexCard) {
  if (!tcgdexCard) return null;
  const tcp = tcgdexCard.pricing?.tcgplayer;
  const cm  = tcgdexCard.pricing?.cardmarket;
  return (
    tcp?.holofoil?.marketPrice             ??
    tcp?.['1st-edition-holofoil']?.marketPrice ??
    tcp?.normal?.marketPrice               ??
    tcp?.['reverse-holofoil']?.marketPrice ??
    cm?.trend                              ??
    null
  );
}

// ---------------------------------------------------------------------------
// prefetchCards(cardIds[]) — fire-and-forget cache warm-up
// ---------------------------------------------------------------------------
export function prefetchCards(cardIds) {
  for (const id of cardIds) fetchCardData(id).catch(() => {});
}

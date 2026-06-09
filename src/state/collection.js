// Collection + bankroll persistence

const COL_KEY      = 'ripsandhits.collection.v1';
const BANK_KEY     = 'ripsandhits.bankroll.v1';
const HISTORY_KEY  = 'ripsandhits.worthhistory.v1';
const DEFAULT_BANK = 100;

// ---------------------------------------------------------------------------
// Bankroll
// ---------------------------------------------------------------------------
export function getBankroll() {
  const v = localStorage.getItem(BANK_KEY);
  return v !== null ? parseFloat(v) : DEFAULT_BANK;
}
export function setBankroll(amount) {
  localStorage.setItem(BANK_KEY, amount.toFixed(2));
  // Refresh the always-visible HUD
  const el = document.getElementById('bk-amount');
  if (el) el.textContent = '$' + amount.toFixed(2);
}
export function deductBankroll(amount) {
  const next = Math.max(0, getBankroll() - amount);
  setBankroll(next);
  return next;
}
export function addToBankroll(amount) {
  const next = getBankroll() + amount;
  setBankroll(next);
  return next;
}
export function initBankrollDisplay() {
  const el = document.getElementById('bk-amount');
  if (el) el.textContent = '$' + getBankroll().toFixed(2);
}

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------
export function getCollection() {
  try { return JSON.parse(localStorage.getItem(COL_KEY)) ?? []; } catch { return []; }
}

export function addCards(cards) {
  const all = getCollection();
  const ids = new Set(all.map((c) => c.id));
  for (const card of cards) {
    all.push({ ...card, pulledAt: Date.now(), isNew: !ids.has(card.id) });
  }
  localStorage.setItem(COL_KEY, JSON.stringify(all));
  recordWorthSnapshot();
}

export function sellCard(uid) {
  const all = getCollection();
  const idx = all.findIndex((c) => c.uid === uid);
  if (idx < 0) return 0;
  const [card] = all.splice(idx, 1);
  localStorage.setItem(COL_KEY, JSON.stringify(all));
  const salePrice = +(card._livePrice ?? card.price ?? card.basePrice ?? 0);
  addToBankroll(salePrice);
  recordWorthSnapshot();
  return salePrice;
}

// ---------------------------------------------------------------------------
// Collection worth
// ---------------------------------------------------------------------------
export function getCollectionWorth() {
  return getCollection().reduce((s, c) => s + +(c._livePrice ?? c.price ?? c.basePrice ?? 0), 0);
}

// ---------------------------------------------------------------------------
// Worth history (sparkline data)
// ---------------------------------------------------------------------------
export function getWorthHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) ?? []; } catch { return []; }
}

export function recordWorthSnapshot() {
  const history = getWorthHistory();
  history.push({ t: Date.now(), worth: +getCollectionWorth().toFixed(2) });
  // Keep last 30 data points
  if (history.length > 30) history.splice(0, history.length - 30);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

---
name: pack-creator
description: >
  Build a themed Pokémon card "pack" from real cards and wire it directly into
  the Rips-and-Hits app. Given a theme (e.g. a Pokémon and its evolution line),
  a pack price, the allowed Pokémon, and a maximum card value, this skill pulls
  real cards from the TCGdex API, filters them by current market value, and
  assembles a weighted pull pool where pull rate is driven by each card's
  CURRENT MARKET VALUE (not its printed rarity) — more valuable cards are rarer.
  It writes the pack into src/data/packs/<id>.json in the app's native format
  and registers it in src/data/cards.js so it appears in-game immediately.
  Trigger when the user says things like "make me a pack", "create a [theme]
  pack", "build a Charizard pack", or mentions pack price / pull rates / chase
  cards.
---

# Pokémon Pack Creator (app-integrated)

You build a themed "pack" of REAL Pokémon cards and install it into the
Rips-and-Hits app. A pack is a **weighted pull pool**: a set of candidate
cards, each with a pull weight and probability. Pull weight is driven by each
card's **current market value** — the more valuable the card, the lower its
pull rate. Weights are balanced so the pack's expected value (EV) lands under
the pack price, leaving a margin.

**The core rule: pull weights come from live market VALUE, not printed rarity.**
A "Common" worth $300 must be rarer to pull than a "Secret Rare" worth $2.

This skill ships a script, `scripts/pack_creator.py`, that does the whole job:
TCGdex fetch → value extraction → EV-balanced weighting → write app pack →
register in cards.js. Prefer running the script; the manual algorithm below is
documented for transparency and tuning.

---

## Step 1 — Gather the pack parameters

Ask the user (AskUserQuestion or direct) and confirm a short summary first.

Required:
1. **Theme / pack name** — e.g. "Charizard Line". Becomes the pack id (slug).
2. **Allowed Pokémon** — names that may appear (e.g. Charizard, Charmeleon,
   Charmander). Matching is INCLUSIVE by default: any card whose name contains
   an allowed name as a whole word is eligible — so "Charizard ex",
   "Charizard VMAX", "M Charizard EX", and multi-Pokémon cards like
   "Charizard & Reshiram-GX" all qualify. It will NOT bleed across species
   (a "Mew" pack won't pull "Mewtwo"). Pass `--exact-name` for standalone names
   only. If they give only a theme, propose the evolution line and confirm.
3. **Pack price** (USD) — what the buyer pays.
4. **Max card value** (USD) — most valuable card allowed; pricier cards excluded.

Optional (sensible defaults):
5. **Cards per pull / pack** — default 5 (matches the app).
6. **Min card value** — default $0.01.
7. **Pool size** — default 25 distinct cards.
8. **Target margin** — default 0.30 (EV ≈ 70% of pack price). EV must stay ≤ price.
9. **Game** — default "pokemon".

---

## Step 2 — Run the bundled script

From the app repo root:

```
python3 .claude/skills/pack-creator/scripts/pack_creator.py \
  --name "Charizard Line" --price 5 --max-value 500 \
  --pokemon Charizard Charmeleon Charmander \
  --cards-per-pack 5 --pool-size 25 --margin 0.30 \
  --app-dir . --install
```

What it does:
- Searches TCGdex for each allowed Pokémon (`/v2/en/cards?name=…`, whose
  default "laxist" matching already returns ex/VMAX/Mega/multi-Pokémon cards),
  then keeps cards whose name contains an allowed name as a whole word
  (or exactly, with `--exact-name`).
- **Verifies species authoritatively**: every kept card must be category
  "Pokemon" and its National Pokédex id (`dexId`) must match the target
  Pokémon (the target dex ids are derived as the mode dexId of each allowed
  name). This catches mislabeled or look-alike cards — e.g. a Combusken that
  slipped through a name match is rejected because its dexId is 256, not 4/5/6.
  Trainer/Energy cards that share a name are dropped. Rejections are printed.
- Fetches each card's full object and reads USD price
  (`pricing.tcgplayer.<variant>.marketPrice`, highest variant; falls back to
  Cardmarket EUR→USD). Cards with no price are dropped.
- **Verifies each card's image ASSET actually loads.** Checking that the API
  object has an `image` field is NOT enough — some cards (e.g. sm12-22
  "Charizard & Braixen GX") have the field but the CDN file at
  `{image}/high.webp` is missing, rendering a blank card in the app. The
  script issues a real HTTP request for the asset and confirms a valid WEBP
  response; definitively-missing assets are dropped
  (`Skip (image missing on CDN)`). If the CDN is unreachable (network error,
  not 404), the card is kept with a `WARNING (image unverified)` — re-run
  `--verify-pack` later to confirm. This happens BEFORE pool selection and
  weight computation.
- Filters to `min_value ≤ value ≤ max_value`, spreads the pool across the
  price range, caps to pool size.
- Computes value-based weights (see Step 3) balanced for `cardsPerPack` draws.
- Derives each card's reveal **tier** from its value (for the glow/particle
  show) and its pull **weight** from its value (for the odds).
- Writes `src/data/packs/<id>.json` in the app's native format and adds the
  import + array entry to `src/data/cards.js` (idempotent).

Print the script's markdown summary to the user. Omit `--install` to preview
the JSON without touching the app.

**Never deploy a `--mock` pack.** `--mock` uses placeholder card IDs, and the
app resolves each card's image LIVE by its id — so fake ids render as the wrong
Pokémon (e.g. `swsh3-23` is really Combusken, not Charmander). The script
refuses `--mock --install` for this reason. Always run WITHOUT `--mock` to build
a real, deployable pack with genuine ids, real prices, and dexId verification.

After generating (or before deploying) any pack, lint it against the live API:

```
python3 .claude/skills/pack-creator/scripts/pack_creator.py \
  --verify-pack src/data/packs/<id>.json
```

This re-fetches every card id and flags any stored name that disagrees with the
real TCGdex card (name mismatch, non-Pokémon, or missing image asset on the
CDN), exiting non-zero if any are found — run it in CI before shipping a pack.

---

## Step 3 — How the weighting works (value, not rarity)

For each card i with value `v_i`, base weight uses a tunable decay exponent `k`:

```
w_i = 1 / (v_i ^ k)
p_i = w_i / Σ_j w_j               # per-draw pull probability
EV_draw = Σ_i (p_i * v_i)         # expected value of ONE draw
EV_pack = EV_draw * cardsPerPack  # draws are independent (with replacement)
```

Solve `k` by bisection so `EV_pack ≈ price * (1 - margin)`, i.e.
`EV_draw_target = price * (1 - margin) / cardsPerPack`. Higher `k` shifts weight
to cheaper cards and lowers EV.

**Chase floor (`--chase`, default 0.5):** a pure power law makes top cards
astronomically rare. `chase` is the fraction of the per-draw EV budget spent
on a UNIFORM floor across all cards: `u = chase * EV_draw_target / mean(v)`,
then `p_i = (1-u) * powerlaw_i + u/n`. This gives expensive cards a real floor
chance (e.g. the $365 chase went from 1-in-8200 to 1-in-2400 per draw at
chase=0.5), paid for by steepening `k` on the rest — EV and margin stay
exactly on target. `--chase 0` restores the old pure inverse-value behaviour;
higher values flatten the top end further. Constraint: EV must stay ≤ price; if even large
`k` can't get there (cheapest card too expensive for the price), the script
flags `evTargetMet: false` — warn the user, the pack can't be profitable as set.

Reveal **tier** is assigned from value thresholds (default: <$1 COMMON,
<$5 UNCOMMON, <$25 RARE, <$100 ULTRA_RARE, else SECRET_RARE). Tier only drives
the reveal visuals; the pull odds come from `weight`.

---

## Step 4 — App data contract

Pack file `src/data/packs/<id>.json`:

```json
{
  "id": "charizard-line",
  "name": "Charizard Line",
  "game": "pokemon",
  "cardsPerPack": 5,
  "price": 5,
  "packTexture": "/packs/RipsNHits_Default.png",
  "releaseDate": "2026-06-09",
  "meta": { "expectedValuePerPack": 3.5, "marginPct": 30.0, "weighting": {"k": 1.23}, "...": "..." },
  "pool": {
    "SECRET_RARE": [ { "id": "base1-4", "name": "Charizard", "value": 415.0, "weight": 12.3 } ],
    "COMMON":      [ { "id": "xy12-9",  "name": "Charmander", "value": 0.5, "weight": 149536.6 } ]
  }
}
```

The app reads this via:
- `src/game/cardSource.js` `buildPool()` — carries each card's `weight` and uses
  `value` as `basePrice`.
- `src/game/pulls.js` `buildCandidates()` — uses the card's `weight` when
  present, else the tier weight (so older packs like `pokemon-151` are
  unaffected).

After installing, the dev server must reload (Vite picks up the new JSON +
cards.js automatically). Card images/prices still resolve live at reveal time
via `src/data/tcgdex.js`.

---

## Edge cases & rules
- **Value, not rarity, drives weight.** Never use the card's `rarity` field for
  pull rates. Tier is derived from value purely for reveal flavor.
- Always confirm parameters first, and report final EV + margin so the user
  sees the pack is sustainable. Account for `cardsPerPack` in EV.
- Exclude cards with no pricing; flag impossible margins.
- Prices are point-in-time — the pack stamps `generatedAt`. Regenerate to refresh.
- Don't invent cards, ids, or prices. Everything comes from real TCGdex data.
- **Species is verified by `dexId`, not just name.** A card is only included if
  it's a Pokémon card whose National Pokédex id matches the target. Review the
  printed "species check rejected" list to see anything that was filtered out.
- Registration is idempotent: re-running updates the JSON and won't duplicate
  the cards.js entry.
- **`cards.js` uses `export const PACKS` (uppercase).** Any fallback/manual
  registration MUST add the import variable to the `PACKS` array, not a
  lowercase `packs` array. After installing, verify the pack variable appears
  inside `export const PACKS = [ ... ]` — if it's only imported but not in the
  array, the pack will be silently invisible in the app.

## Quick reference
- Search: `GET https://api.tcgdex.net/v2/en/cards?name=<Pokemon>` → CardBrief[] (no price)
- Card+price: `GET https://api.tcgdex.net/v2/en/cards/{id}` (or `/sets/{setId}/{localId}`)
- USD: `pricing.tcgplayer.<holofoil|normal|reverse-holofoil|...>.marketPrice`
- Species check: card.`category`=="Pokemon" AND card.`dexId` ∩ target dex ids
- Image: brief `image` + `/high.webp`
- Script: `scripts/pack_creator.py` (`--install`, `--mock`, `--app-dir`, `--exact-name`, `--verify-pack`)
- NEVER deploy `--mock` packs (placeholder ids → wrong images); build real packs without `--mock`
- Lint any pack: `--verify-pack src/data/packs/<id>.json` (re-fetches live, flags mismatches)
- Name matching: inclusive whole-word by default (ex/VMAX/multi included); `--exact-name` for standalone only
- Docs: https://tcgdex.dev/markets-prices , https://tcgdex.dev/rest/cards

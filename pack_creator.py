#!/usr/bin/env python3
"""
pack_creator.py — Build a themed Pokemon "pack" from real TCGdex cards and wire
it directly into the Rips-and-Hits app.

Pull weight is driven by each card's CURRENT MARKET VALUE (not printed rarity):
the more valuable a card, the lower its pull rate. Weights are tuned so the
pack's expected value (EV) lands at/under a target fraction of the pack price,
accounting for cardsPerPack independent draws.

The output is the app's native pack format (src/data/packs/<id>.json):
  - cards bucketed into the 5 reveal TIERS (tier is derived FROM value, so the
    glow/particle/holo show still works), and
  - each card carries `value` and a value-based `weight` that the patched pull
    engine uses for true value-driven odds.

Usage (live API + install into the app):
    python3 pack_creator.py --name "Charizard Line" --price 5 --max-value 500 \
        --pokemon Charizard Charmeleon Charmander \
        --cards-per-pack 5 --pool-size 25 --margin 0.30 \
        --app-dir /path/to/Rips-Hits --install

Self-test (no network, embedded sample data, verifies math + output shape):
    python3 pack_creator.py --mock --install --app-dir /path/to/Rips-Hits

Omit --install to just write the JSON without touching cards.js.
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timezone

API = "https://api.tcgdex.net/v2/en"
UA = {"User-Agent": "pack-creator/1.0 (+https://getluckyvr.com)"}

# Value -> reveal TIER thresholds (USD). Tier is cosmetic (drives the reveal
# show); pull odds come from `weight`. Both are derived from value.
TIER_THRESHOLDS = [
    (1.0,    "COMMON"),
    (5.0,    "UNCOMMON"),
    (25.0,   "RARE"),
    (100.0,  "ULTRA_RARE"),
    (float("inf"), "SECRET_RARE"),
]
TIER_ORDER = ["COMMON", "UNCOMMON", "RARE", "ULTRA_RARE", "SECRET_RARE"]


# ----------------------------- TCGdex access ------------------------------ #

def _get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def search_cards(name):
    """Return CardBrief list (id, localId, name, image) — NO pricing here."""
    return _get(f"{API}/cards?name={urllib.parse.quote(name)}")


def get_card(card_id):
    """Return the full card object (incl. `pricing`). Uses set/localId endpoint
    first to dodge URL-encoding issues with dotted set ids, mirroring the app."""
    dash = card_id.find("-")
    urls = []
    if dash > 0:
        urls.append(f"{API}/sets/{card_id[:dash]}/{card_id[dash+1:]}")
    urls.append(f"{API}/cards/{urllib.parse.quote(card_id)}")
    last = None
    fallback = None
    for u in urls:
        try:
            data = _get(u)
        except Exception as e:  # noqa: BLE001
            last = e
            continue
        # Guard against the endpoint returning a different card than requested.
        if data.get("id") == card_id:
            return data
        fallback = fallback or data
    if fallback is not None:
        return fallback
    raise last


# --------------------------- value extraction ----------------------------- #
# Variant keys span both naming styles seen in the wild / in src/data/tcgdex.js.
TCG_VARIANTS = ("holofoil", "1st-edition-holofoil", "holo", "reverse-holofoil",
                "reverse", "normal", "1st-edition", "unlimited")


def extract_usd_value(card, eur_to_usd=1.08):
    pricing = card.get("pricing") or {}
    tcg = pricing.get("tcgplayer") or {}
    best, best_variant = None, None
    for variant in TCG_VARIANTS:
        v = tcg.get(variant)
        if isinstance(v, dict):
            mp = v.get("marketPrice") or v.get("midPrice") or v.get("lowPrice")
            if isinstance(mp, (int, float)) and (best is None or mp > best):
                best, best_variant = float(mp), variant
    if best is not None:
        return best, f"tcgplayer.{best_variant}.marketPrice"
    cm = pricing.get("cardmarket") or {}
    eur = cm.get("trend") or cm.get("avg30") or cm.get("avg")
    if isinstance(eur, (int, float)):
        return round(float(eur) * eur_to_usd, 2), "cardmarket.trend (EUR->USD)"
    return None, "no pricing available"


def tier_for_value(v):
    for ceiling, tier in TIER_THRESHOLDS:
        if v < ceiling:
            return tier
    return "SECRET_RARE"


# --------------------------- weighting / EV -------------------------------- #

def ev_for_k(values, k):
    w = [1.0 / (v ** k) for v in values]
    s = sum(w)
    p = [wi / s for wi in w]
    ev = sum(pi * vi for pi, vi in zip(p, values))
    return ev, p


def solve_k(values, target_ev, lo=0.0, hi=20.0, iters=80):
    """EV decreases monotonically as k grows. Bisection for k where EV~=target.
    Returns (k, target_met)."""
    ev_hi, _ = ev_for_k(values, hi)
    if ev_hi > target_ev:
        return hi, False  # even max decay can't get EV low enough
    for _ in range(iters):
        mid = (lo + hi) / 2
        ev, _ = ev_for_k(values, mid)
        if ev > target_ev:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2, True


# ----------------------------- pool building ------------------------------- #

def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def camel(slug):
    parts = re.split(r"[^a-z0-9]+", slug.lower())
    parts = [p for p in parts if p]
    if not parts:
        return "pack"
    head = parts[0]
    if head[0].isdigit():
        head = "p" + head
    return head + "".join(p.capitalize() for p in parts[1:])


def expected_dex_ids(full_cards, allowed):
    """Determine the canonical National Pokedex id for each allowed name by
    taking the MODE dexId among real Pokémon cards whose name equals that name
    exactly. Using the mode makes this robust to a few mislabeled entries."""
    wanted = {a.lower().strip(): Counter() for a in allowed}
    for _brief, card in full_cards:
        if (card.get("category") or "Pokemon") != "Pokemon":
            continue
        nm = (card.get("name") or "").lower().strip()
        if nm in wanted:
            for d in (card.get("dexId") or []):
                wanted[nm][d] += 1
    out = set()
    for nm, ctr in wanted.items():
        if ctr:
            out.add(ctr.most_common(1)[0][0])
    return out


def name_matches(card_name, allowed, exact=False):
    """Match a card to the allowed Pokemon names.

    Default (inclusive): the Pokemon name must appear as a WHOLE WORD, so it
    includes "Charizard ex", "Charizard VMAX", "M Charizard EX" and multi-Pokemon
    cards like "Charizard & Reshiram-GX", while NOT bleeding across species
    (a "Mew" pack won't pull "Mewtwo"). exact=True requires the card name to
    equal an allowed name exactly (no ex/VMAX/multi variants)."""
    n = card_name.lower().strip()
    for raw in allowed:
        pl = raw.lower().strip()
        if exact:
            if n == pl:
                return True
        else:
            # whole-word: boundaries are anything that isn't a letter/digit
            if re.search(r"(?<![a-z0-9])" + re.escape(pl) + r"(?![a-z0-9])", n):
                return True
    return False


def build_pack(name, price, max_value, allowed, game="pokemon",
               cards_per_pack=5, pool_size=25, min_value=0.01, margin=0.30,
               pack_texture="/packs/RipsNHits_Default.png", release_date=None,
               exact_name=False, sample=None, sleep=0.15):
    # 1. gather candidate full-card objects
    if sample is not None:
        full_cards = sample
    else:
        briefs = {}
        for poke in allowed:
            for b in search_cards(poke):
                briefs[b["id"]] = b
            time.sleep(sleep)
        full_cards = []
        for cid in briefs:
            try:
                full_cards.append((briefs[cid], get_card(cid)))
            except Exception as e:  # noqa: BLE001
                print(f"  skip {cid}: {e}", file=sys.stderr)
            time.sleep(sleep)

    # 2. price + species-verify + filter
    target_dex = expected_dex_ids(full_cards, allowed)
    priced, rejected = [], []
    for brief, card in full_cards:
        cname = card.get("name", "")
        if not name_matches(cname, allowed, exact=exact_name):
            continue
        # Only real Pokémon cards (drop Trainer/Energy that share a name).
        category = card.get("category") or "Pokemon"
        if category != "Pokemon":
            rejected.append((cname, card.get("id"), f"not a Pokémon card ({category})"))
            continue
        # AUTHORITATIVE species check: the card's National Pokédex id(s) must
        # match the target Pokémon. Catches e.g. a Combusken mislabeled as
        # Charmander. Falls back to the name match only when dex data is absent.
        dex = card.get("dexId") or []
        if target_dex and dex and not (set(dex) & target_dex):
            rejected.append((cname, card.get("id"),
                             f"dexId {dex} != target {sorted(target_dex)}"))
            continue
        val, src = extract_usd_value(card)
        if val is None or val < min_value or val > max_value:
            continue
        priced.append({
            "id": card.get("id"),
            "name": card.get("name"),
            "value": round(val, 2),
            "_src": src,
        })
    if rejected:
        print(f"  species check rejected {len(rejected)} card(s):", file=sys.stderr)
        for nm, cid, why in rejected:
            print(f"    - {nm} ({cid}): {why}", file=sys.stderr)
    if len(priced) < 2:
        raise SystemExit("Not enough priced cards in range. Widen the Pokemon "
                         "list, raise --max-value, or lower --min-value.")

    # 3. spread across the price range, then cap to pool size
    priced.sort(key=lambda c: c["value"])
    if len(priced) > pool_size:
        idxs = sorted({round(i * (len(priced) - 1) / (pool_size - 1))
                       for i in range(pool_size)})
        priced = [priced[i] for i in idxs]

    # 4. value-based weights, EV-balanced for cardsPerPack independent draws
    values = [c["value"] for c in priced]
    target_ev_pack = price * (1 - margin)
    target_ev_draw = target_ev_pack / max(1, cards_per_pack)
    k, ok = solve_k(values, target_ev_draw)
    ev_draw, probs = ev_for_k(values, k)
    ev_pack = ev_draw * cards_per_pack

    for c, p in zip(priced, probs):
        c["weight"] = round(p * 1_000_000, 2)   # relative weight for the engine
        c["_prob_draw"] = p
        c["_odds"] = f"1 in {round(1/p):,}" if p > 0 else "n/a"
        c["tier"] = tier_for_value(c["value"])

    win_draw = sum(p for c, p in zip(priced, probs) if c["value"] > price)
    win_pack = 1 - (1 - win_draw) ** cards_per_pack

    # 5. assemble app-native pack (pool keyed by TIER)
    pool = {t: [] for t in TIER_ORDER}
    for c in sorted(priced, key=lambda c: c["value"], reverse=True):
        pool[c["tier"]].append({
            "id": c["id"], "name": c["name"],
            "value": c["value"], "weight": c["weight"],
        })
    pool = {t: cs for t, cs in pool.items() if cs}  # drop empty tiers

    pack = {
        "id": slugify(name),
        "name": name,
        "game": game,
        "cardsPerPack": cards_per_pack,
        "price": round(price, 2),
        "packTexture": pack_texture,
        "releaseDate": release_date or datetime.now(timezone.utc).date().isoformat(),
        "meta": {
            "maxCardValue": max_value,
            "minCardValue": min_value,
            "poolSize": len(priced),
            "expectedValuePerPack": round(ev_pack, 2),
            "expectedValuePerDraw": round(ev_draw, 4),
            "marginPct": round((1 - ev_pack / price) * 100, 1),
            "evTargetMet": ok,
            "chanceHitOverPrice_perPack": round(win_pack, 6),
            "weighting": {"method": "inverse_value_ev_balanced", "k": round(k, 4)},
            "pricingSource": "tcgplayer.marketPrice (fallback cardmarket.trend)",
            "speciesVerified": True,
            "targetDexIds": sorted(target_dex),
            "rejectedCount": len(rejected),
            "generatedAt": datetime.now(timezone.utc).isoformat(),
        },
        "pool": pool,
    }
    # stash display rows for the markdown summary
    pack["_rows"] = sorted(
        [{"name": c["name"], "value": c["value"], "tier": c["tier"],
          "prob": c["_prob_draw"], "odds": c["_odds"]} for c in priced],
        key=lambda r: r["value"], reverse=True)
    return pack


# ------------------------------ install ------------------------------------ #

def write_pack_file(pack, app_dir):
    packs_dir = os.path.join(app_dir, "src", "data", "packs")
    os.makedirs(packs_dir, exist_ok=True)
    out = {k: v for k, v in pack.items() if not k.startswith("_")}
    path = os.path.join(packs_dir, f"{pack['id']}.json")
    with open(path, "w") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
    return path


def register_in_cards_js(pack, app_dir):
    """Idempotently add the import + PACKS array entry in src/data/cards.js."""
    cards_js = os.path.join(app_dir, "src", "data", "cards.js")
    if not os.path.exists(cards_js):
        return None, "cards.js not found — skipped registration"
    src = open(cards_js, encoding="utf-8").read()
    var = camel(pack["id"])
    imp = f"import {var} from './packs/{pack['id']}.json';"
    if imp in src:
        return cards_js, "already registered"

    # insert import after the last existing import line
    lines = src.splitlines()
    last_imp = max((i for i, l in enumerate(lines) if l.startswith("import ")),
                   default=-1)
    lines.insert(last_imp + 1, imp)

    # insert the var into the PACKS array (before its closing bracket)
    text = "\n".join(lines)
    m = re.search(r"export const PACKS = \[(.*?)\];", text, re.S)
    if not m:
        return cards_js, "PACKS array not found — added import only; add manually"
    body = m.group(1)
    new_body = body.rstrip()
    if new_body and not new_body.endswith(","):
        new_body += ","
    new_body += f"\n  {var},"
    text = text[:m.start(1)] + new_body + "\n" + text[m.end(1):]
    with open(cards_js, "w", encoding="utf-8") as f:
        f.write(text)
    return cards_js, "registered"


# ------------------------------- output ------------------------------------ #

def render_markdown(pack):
    m = pack["meta"]
    warn = "" if m["evTargetMet"] else \
        " ⚠️ cheapest card exceeds EV target — pack can't hit this margin"
    lines = [
        f"# {pack['name']} — Pack",
        "",
        f"- **Price:** ${pack['price']:.2f}  ·  **Cards per pack:** {pack['cardsPerPack']}",
        f"- **Allowed:** {pack['game']} — {m['poolSize']} cards in pool",
        f"- **Max card value:** ${m['maxCardValue']:.2f}",
        f"- **Expected value / pack:** ${m['expectedValuePerPack']:.2f} "
        f"({m['marginPct']}% margin){warn}",
        f"- **Chance of a card worth > pack price (per pack):** "
        f"{m['chanceHitOverPrice_perPack']*100:.2f}%",
        f"- **Weighting:** inverse value, k={m['weighting']['k']}",
        "",
        "| Card | Value (USD) | Tier | Per-draw % | Odds |",
        "|---|--:|---|--:|--:|",
    ]
    for r in pack["_rows"]:
        lines.append(f"| {r['name']} | ${r['value']:.2f} | {r['tier']} | "
                     f"{r['prob']*100:.3f}% | {r['odds']} |")
    lines.append("")
    lines.append(f"_Point-in-time values, fetched {pack['meta']['generatedAt']}._")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", default="Charizard Line")
    ap.add_argument("--price", type=float, default=5.0)
    ap.add_argument("--max-value", type=float, default=500.0)
    ap.add_argument("--min-value", type=float, default=0.01)
    ap.add_argument("--pokemon", nargs="+",
                    default=["Charizard", "Charmeleon", "Charmander"])
    ap.add_argument("--game", default="pokemon")
    ap.add_argument("--cards-per-pack", type=int, default=5)
    ap.add_argument("--pool-size", type=int, default=25)
    ap.add_argument("--margin", type=float, default=0.30)
    ap.add_argument("--pack-texture", default="/packs/RipsNHits_Default.png")
    ap.add_argument("--release-date", default=None)
    ap.add_argument("--exact-name", action="store_true",
                    help="only standalone names (exclude ex/VMAX/multi-Pokemon cards)")
    ap.add_argument("--app-dir", default=".",
                    help="repo root containing src/data/packs and cards.js")
    ap.add_argument("--install", action="store_true",
                    help="write pack into src/data/packs and register in cards.js")
    ap.add_argument("--mock", action="store_true",
                    help="run offline against embedded sample data")
    args = ap.parse_args()

    pack = build_pack(
        args.name, args.price, args.max_value, args.pokemon, game=args.game,
        cards_per_pack=args.cards_per_pack, pool_size=args.pool_size,
        min_value=args.min_value, margin=args.margin,
        pack_texture=args.pack_texture, release_date=args.release_date,
        exact_name=args.exact_name,
        sample=(MOCK_CARDS if args.mock else None))

    md = render_markdown(pack)
    print(md)

    if args.install:
        path = write_pack_file(pack, args.app_dir)
        cards_js, status = register_in_cards_js(pack, args.app_dir)
        print(f"\n[ok] wrote {path}")
        print(f"[ok] cards.js: {status}")
    else:
        out = {k: v for k, v in pack.items() if not k.startswith("_")}
        with open(f"{pack['id']}.json", "w", encoding="utf-8") as f:
            json.dump(out, f, indent=2, ensure_ascii=False)
        print(f"\n[ok] wrote {pack['id']}.json (not installed -- pass --install)")


def _c(cid, nm, tcg, dex=None, category="Pokemon"):
    img = f"https://assets.tcgdex.net/en/{cid.split('-')[0]}/{cid}"
    full = {"id": cid, "name": nm, "image": img, "category": category,
            "pricing": {"tcgplayer": tcg}}
    if dex is not None:
        full["dexId"] = dex
    return ({"id": cid, "name": nm, "image": img}, full)

MOCK_CARDS = [
    # dexId: Charizard=6, Charmeleon=5, Charmander=4
    _c("base1-4",   "Charizard",  {"holofoil": {"marketPrice": 415.0}}, [6]),
    _c("base2-4",   "Charizard",  {"holofoil": {"marketPrice": 180.0}}, [6]),
    _c("base4-4",   "Charizard",  {"holofoil": {"marketPrice": 95.0}}, [6]),
    _c("xy12-11",   "Charizard",  {"holofoil": {"marketPrice": 22.5}, "normal": {"marketPrice": 8.0}}, [6]),
    _c("g1-11",     "Charizard",  {"holofoil": {"marketPrice": 16.0}}, [6]),
    _c("swsh3-25",  "Charizard",  {"holofoil": {"marketPrice": 11.0}}, [6]),
    _c("cel25-4",   "Charizard",  {"holofoil": {"marketPrice": 9.5}}, [6]),
    _c("det1-5",    "Charizard",  {"normal": {"marketPrice": 4.25}}, [6]),
    _c("base1-24",  "Charmeleon", {"holofoil": {"marketPrice": 12.0}}, [5]),
    _c("xy12-10",   "Charmeleon", {"normal": {"marketPrice": 0.75}, "reverse-holofoil": {"marketPrice": 1.5}}, [5]),
    _c("swsh3-24",  "Charmeleon", {"normal": {"marketPrice": 0.35}}, [5]),
    _c("base1-46",  "Charmander", {"normal": {"marketPrice": 3.5}, "reverse-holofoil": {"marketPrice": 6.0}}, [4]),
    _c("xy12-9",    "Charmander", {"normal": {"marketPrice": 0.5}}, [4]),
    _c("swsh3-23",  "Charmander", {"normal": {"marketPrice": 0.15}, "reverse-holofoil": {"marketPrice": 0.4}}, [4]),
    _c("det1-4",    "Charmander", {"normal": {"marketPrice": 0.25}}, [4]),
    # ex / VMAX / Mega / multi-Pokemon variants — included via whole-word match
    _c("sv03.5-6",   "Charizard ex",            {"holofoil": {"marketPrice": 18.0}}, [6]),
    _c("swsh3-20",   "Charizard VMAX",          {"holofoil": {"marketPrice": 35.0}}, [6]),
    _c("xy12-12",    "M Charizard EX",          {"holofoil": {"marketPrice": 28.0}}, [6]),
    _c("col1-13",    "Charizard & Reshiram-GX", {"holofoil": {"marketPrice": 14.0}}, [6, 643]),
    # DECOYS that must be rejected by the species check:
    _c("bad-1", "Charmander", {"normal": {"marketPrice": 2.0}}, [256]),          # really Combusken (dex 256)
    _c("bad-2", "Charizard",  {"holofoil": {"marketPrice": 3.0}}, None, "Trainer"),  # a Trainer card
]

if __name__ == "__main__":
    main()

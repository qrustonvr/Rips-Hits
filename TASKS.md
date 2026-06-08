# Rips & Hits — Implementation Task Queue

Each section below is a self-contained prompt. Trigger them in order. Each prompt assumes the previous ones are done. Copy the full block under **Prompt** and paste it into the chat.

---

## Phase 1 — Renderer & Main Loop

**What gets built:** `src/scene/renderer.js`, `src/main.js`  
WebGL 2 renderer with WebGL 1 fallback, DPR capped at `min(devicePixelRatio, 2)`, rAF loop with delta-time, pause when tab is hidden (`visibilitychange`), resize handler.

**Prompt:**
```
Implement the core Three.js renderer and main loop for Rips & Hits (src/scene/renderer.js and src/main.js).

Requirements from PLAN.md:
- Three.js r155+, Vite, no framework
- WebGL 2 target with graceful WebGL 1 fallback (check WebGL2RenderingContext support)
- DPR capped at min(devicePixelRatio, 2) — non-negotiable
- rAF loop driven by delta-time (seconds since last frame)
- Pause the loop when the tab is hidden (document visibilitychange event), resume on show
- Resize handler that updates camera aspect + renderer size
- Export: createRenderer() returns { renderer, scene, camera }, and startLoop(updateFn) / stopLoop()

Keep renderer.js focused on setup/lifecycle. main.js wires everything together (import router, start loop). No game logic here yet.
```

---

## Phase 2 — Data Layer

**What gets built:** `src/data/cards.js`, `src/game/rarity.js`, `src/game/cardSource.js`, `public/data/cards.json`, `public/data/sets.json`  
Static JSON seed data, normalized rarity tiers, CardSource adapter pattern.

**Prompt:**
```
Implement the data layer for Rips & Hits.

Files to create/update:
- public/data/sets.json — 2 sets: "pokemon-base" (Pokémon placeholder, 10 cards) and "onepiece-op01" (One Piece placeholder, 10 cards). Each set has: id, name, game ("pokemon"|"onepiece"), packArt (placeholder path), cardCount, releaseDate.
- public/data/cards.json — 20 placeholder cards (10 per set). Each card: id, setId, name, number, rarity (raw string like "Rare Holo" for Pokémon), imageFront (placeholder path), imageBack (placeholder path), marketPrice (null for now).
- src/game/rarity.js — Export RARITY enum: { COMMON, UNCOMMON, RARE, ULTRA_RARE, SECRET_RARE }. Export normalizeRarity(game, rawString) → RARITY tier. Pokémon mapping: Common→COMMON, Uncommon→UNCOMMON, Rare/Rare Holo→RARE, ex/GX/V/VMAX→ULTRA_RARE, Star/Alt Art/Gold→SECRET_RARE. One Piece: Common→COMMON, Uncommon→UNCOMMON, Rare→RARE, Super Rare/Special Rare→ULTRA_RARE, Secret Rare/Leader Rare→SECRET_RARE.
- src/game/cardSource.js — CardSource class. Constructor takes game ("pokemon"|"onepiece"). Methods: async loadSet(setId) → array of normalized card objects ({ id, name, setId, rarity (normalized tier), imageFront, imageBack, marketPrice }). Internal fetch from /data/cards.json + /data/sets.json. All rarity normalization happens inside this adapter — callers never see raw rarity strings.
- src/data/cards.js — Re-export CardSource. Also export getCardsBySet(setId) convenience async function.

No backend, no DB. Static JSON only.
```

---

## Phase 3 — App Shell & Router

**What gets built:** `src/app/router.js`, `src/app/screens/*.js`, `src/styles/main.css`, `index.html`  
Hash-based router, 5 screens (Home / Open / Collection / Community / Profile), mobile-first CSS, bottom nav.

**Prompt:**
```
Implement the app shell for Rips & Hits — router, screens, and mobile-first CSS.

src/app/router.js:
- Simple hash router (#home, #open, #collection, #community, #profile)
- Default route: #home
- Export: initRouter() wires hashchange + initial load; navigateTo(route) programmatic navigation
- Each route calls the matching screen's mount(container) / unmount() lifecycle

src/app/screens/ (one file each):
- home.js — Pack shelf. For now renders a static list of 2 pack cards (pokemon-base, onepiece-op01) from sets.json. Clicking a pack calls navigateTo('#open') and stores selected setId in sessionStorage.
- open.js — Placeholder: "Open screen — Three.js canvas mounts here." The canvas from renderer.js will be injected here in a later phase. For now just a black div with that text.
- collection.js — Reads localStorage key "rips-collection" (JSON array of card ids) and renders a grid of card names. Empty state: "No cards yet. Rip a pack!"
- community.js — Static placeholder UI.
- profile.js — Static placeholder UI.

src/styles/main.css:
- Mobile-first, max-width 430px centered on desktop
- CSS custom properties for colors: --bg #0a0a0f, --surface #13131a, --accent #f5c842, --text #ffffff, --text-muted #888
- Bottom nav bar (fixed, 5 icons/labels). Active state uses --accent.
- Smooth screen transitions (opacity fade 150ms)
- No framework, no Tailwind — vanilla CSS only

index.html:
- Single #app div
- Import src/main.js as module
- Viewport meta: width=device-width, initial-scale=1, viewport-fit=cover
- Theme color meta: #0a0a0f
```

---

## Phase 4 — Pack 3D Scene

**What gets built:** `src/scene/pack/pack.js`  
3D pack object: BoxGeometry, foil texture (env-map + crinkle normal), idle bob, single-finger rotate with inertia, two-finger pinch zoom, limited range.

**Prompt:**
```
Implement the 3D sealed pack scene in src/scene/pack/pack.js for Rips & Hits.

The pack is a Three.js BoxGeometry displayed in the Open screen before tearing.

Geometry & material:
- BoxGeometry sized like a real TCG booster pack (approx 0.7 × 1.0 × 0.15 units)
- 6 faces. Front/back: MeshStandardMaterial with map (pack art texture loaded from path passed in). Spine/edges: foil-like MeshStandardMaterial with metalness 0.9, roughness 0.15.
- Env-map: use THREE.PMREMGenerator with a simple RoomEnvironment (or a grey equirect fallback) for reflections
- Normal map on front face simulating crinkle/foil texture (generate a placeholder 64×64 canvas normal map with subtle noise if no texture file exists)

Animation:
- Idle bob: sine wave on Y-axis, amplitude 0.05, frequency ~0.8Hz, driven by delta-time in the update(dt) method
- After a pointer release, apply velocity-based spin inertia that decays over ~1.5s (multiply by 0.95 per frame at 60fps equivalent)

Interaction (pointer events, not mouse events — works on mobile):
- Single-finger drag: rotate pack on X and Y axes (rotation speed ~0.005 per pixel). Clamp X rotation to ±40°.
- Two-finger pinch: scale the pack between 0.7 and 1.3. Track touch distance delta.

Export:
- createPack({ setId, packArtPath, scene, camera }) → { mesh, update(dt), dispose(), enableInteraction(domElement), disableInteraction() }
- update(dt) handles bob + inertia decay (called from main rAF loop)
- The pack starts centered at origin, camera at z=2.5.
```

---

## Phase 5 — Tear Strip Gesture

**What gets built:** `src/scene/pack/tearStrip.js`, updates to `src/interact/gestures.js`  
The corner tab mesh, verlet chain curl, `t` (0→1) progress driver, foil crinkle audio scrub hook, failure recovery states, strip detach + free-body animation.

**Prompt:**
```
Implement the tear strip gesture system for Rips & Hits.

Files: src/scene/pack/tearStrip.js and src/interact/gestures.js

--- tearStrip.js ---

The tear strip is a segmented mesh along the top edge of the pack.

Geometry:
- A strip of N=12 quad segments across the pack top (~0.7 units wide, 0.08 units tall)
- Each segment is a separate small PlaneGeometry so they can rotate independently (or use a single BufferGeometry with per-vertex manipulation)
- A small triangular "tab" mesh at the right end of the strip (the grab point)
- Material: foil — MeshStandardMaterial metalness 0.95, roughness 0.1, slight gold tint

Verlet chain curl:
- 13 anchor points along the strip top edge (one per segment boundary)
- When t > 0, segments from the right peel away: segment i starts curling when t passes i/N
- Curl angle for segment i = smoothstep(0, 1, (t - i/N) * N) * 180° — creates a natural rolling peel
- The freed strip end droops slightly (add a downward gravity offset proportional to how many segments are free)

Progress driver:
- Single value t (0→1) drives everything: curl, audio, haptics hook, detach
- expose: setProgress(t), getProgress(), snapBack(onComplete), detach()

Failure recovery:
- release before t=0.4 → call snapBack(): spring animation back to t=0 over 300ms (ease-out cubic)
- t=0.4–0.7 and pointer released → freeze, emit event "nudge" (caller shows "keep pulling" UI)
- No input for 3s after partial progress → auto snapBack()

Detach (t reaches 1.0):
- Strip mesh separates from pack parent
- Apply hand-rolled spring physics: initial velocity from last pointer delta, gravity -9.8 units/s², light drag 0.98/frame
- Strip tumbles (random angular velocity) and falls off screen over ~1.2s then disposes itself

Export: createTearStrip({ packMesh, scene }) → { mesh, tabMesh, update(dt), setProgress(t), getProgress(), snapBack(cb), on(event, cb), dispose() }

--- gestures.js ---

Maps pointer events on the canvas to tear strip progress:
- Pointer down on tab mesh (raycaster hit test) → start drag, emit "grab" (haptic hook)
- Pointer move → compute horizontal delta as fraction of pack width → update t
- Pointer up → if t < 1.0, emit "release" with current t (tearStrip handles recovery)
- Also keep the existing pack rotation logic from Phase 4 (mode-switch: if pointer hits tab → tear mode, else → rotate mode)

Emit all events via a simple EventEmitter (no external lib — 10-line implementation).
```

---

## Phase 6 — Card Reveal System

**What gets built:** `src/scene/cards/card.js`, `src/scene/cards/revealController.js`, `src/scene/cards/textures.js`  
Card mesh with back/front faces, per-rarity beat sequence (pre-flip glow → flip → effects), tap-to-flip gate, price reveal.

**Prompt:**
```
Implement the card reveal system for Rips & Hits.

--- src/scene/cards/textures.js ---
- loadCardTexture(url) → Promise<THREE.Texture>. Uses TextureLoader with a simple LRU cache (max 50 entries). On load error returns a 1×1 grey fallback texture.
- loadCardBack(game) → loads /cards/{game}/card-back.png (or grey fallback)
- generatePlaceholderFront(card) → creates a canvas texture: colored by rarity (COMMON=grey, UNCOMMON=silver, RARE=gold, ULTRA_RARE=purple, SECRET_RARE=rainbow gradient), card name text centered.

--- src/scene/cards/card.js ---

Geometry: PlaneGeometry 0.63 × 0.88 (standard TCG card ratio). Two-sided with front and back materials.

Materials:
- Back: MeshStandardMaterial with card back texture
- Front: MeshStandardMaterial with card front texture (loaded async; shows placeholder until ready)
- Card starts showing back face (rotationY = 0 = back visible; 180° = front visible)

Export: createCard({ cardData, game, scene }) → { mesh, flip(onMidpoint), showPreFlipGlow(duration), hideGlow(), update(dt), dispose() }
- flip(onMidpoint): animates rotationY 0→180°. Duration from rarity table below. Calls onMidpoint() at 90° (for effects).
- showPreFlipGlow(duration): adds a colored border glow (a slightly larger plane behind the card, emissive color from rarity, pulsing opacity). Duration: COMMON=0.5s, UNCOMMON=1.0s, RARE=1.5s, ULTRA_RARE=2.0s, SECRET_RARE=2.5s.
- Flip durations: COMMON=0.3s, UNCOMMON=0.4s, RARE=0.5s, ULTRA_RARE=0.8s, SECRET_RARE=1.2s.

--- src/scene/cards/revealController.js ---

Manages the full per-card beat sequence for an array of cards (from PRD section):

1. Card slides up from bottom of screen (translateY from +2 to 0, 0.3s ease-out)
2. showPreFlipGlow() — back border glows in rarity color, duration scales with rarity
3. Input gate:
   - COMMON + UNCOMMON: auto-flip after glow duration
   - RARE+: wait for tap on card (pointer up on card mesh raycaster hit)
4. flip() — at midpoint (90°) fire rarity effects via emitted "rarityReveal" event (particles + screen flash handled by caller)
5. Post-reveal hold: card face visible, no auto-advance. Tap anywhere to advance.
6. Price reveal: after 1.5s, fade in market price text (HTML overlay positioned below the card) from cardData.marketPrice (or "—" if null)

Export: createRevealController({ cards, scene, camera, domElement }) → { start(), on(event, cb), dispose() }
Events: "rarityReveal" { card, rarity }, "cardComplete" { card }, "allComplete"

Cards slide in one at a time (next card waits for "cardComplete").
```

---

## Phase 7 — Holo Shader

**What gets built:** `src/shaders/holo.vert.glsl`, `src/shaders/holo.frag.glsl`, `src/scene/cards/holoMaterial.js`  
Shader-based holographic foil effect on the card front face, activated for RARE+ tiers.

**Prompt:**
```
Implement the holographic card shader for Rips & Hits.

Files: src/shaders/holo.vert.glsl, src/shaders/holo.frag.glsl, src/scene/cards/holoMaterial.js

The holo effect is a ShaderMaterial layered on top of the card front face (RARE and above).

Vertex shader (holo.vert.glsl):
- Standard MVP transform
- Pass UV, worldNormal, viewDirection to fragment
- vViewDir = normalize(cameraPosition - worldPosition)

Fragment shader (holo.frag.glsl):
- Base layer: sample the card texture (uniform sampler2D uCardTex)
- Holo layer:
  - Compute fresnel = pow(1.0 - dot(vViewDir, vNormal), 2.0) — rim lighting
  - Rainbow bands: hue = fract(vUv.y * 6.0 + uTime * 0.3 + dot(vViewDir.xy, vec2(0.5))) — shifts as view angle changes
  - Convert hue to RGB (hue2rgb function)
  - Mix: gl_FragColor = cardColor + holoColor * fresnel * uHoloIntensity
- Uniforms: uCardTex, uTime (float, seconds), uHoloIntensity (float 0.0–1.0), uFoilMask (sampler2D — white = full holo, black = no holo; use white 1×1 fallback if no mask)
- For SECRET_RARE: uHoloIntensity = 1.0, add scanline shimmer: + sin(vUv.y * 80.0 + uTime * 5.0) * 0.04

holoMaterial.js:
- createHoloMaterial({ cardTexture, foilMask, rarity }) → THREE.ShaderMaterial
- uHoloIntensity by rarity: RARE=0.3, ULTRA_RARE=0.6, SECRET_RARE=1.0
- Export updateHoloTime(material, time) — call from rAF loop with elapsed seconds
- COMMON/UNCOMMON: return standard MeshStandardMaterial (no shader, skip holo cost)
```

---

## Phase 8 — Audio System

**What gets built:** `src/audio/sound.js`  
Web Audio API engine: foil crinkle scrub tied to tear `t` velocity, rarity stingers, flip ticks. All sounds procedurally generated (no audio files required in Phase 1).

**Prompt:**
```
Implement the audio system for Rips & Hits in src/audio/sound.js using the Web Audio API only — no audio files required. All sounds are procedurally synthesized.

Requirements:
- AudioContext created on first user interaction (click/touch) to satisfy browser autoplay policy. Export: initAudio() call this on first gesture.
- Master gain node. Export: setMasterVolume(0–1).

Sounds to implement:

1. crinkleSound(velocity) — called each frame during tear with pull velocity (t delta per second, 0–3 range).
   - Bandpass-filtered white noise burst, frequency mapped to velocity (500Hz at slow, 3kHz at fast)
   - Duration: 30ms per call, gain proportional to velocity
   - Called from tearStrip update loop

2. tearPop() — at t=1.0 detach. Short "pop": sine wave 200→50Hz sweep over 80ms, slight reverb (delay node 20ms, gain 0.3).

3. cardSlideIn() — soft whoosh: filtered noise 200Hz lowpass, 120ms fade in/out.

4. flipTick(rarity) — card flip sound per rarity tier:
   - COMMON: short click (square wave 800Hz, 20ms)
   - UNCOMMON: light chime (sine 1200Hz, 80ms, gentle decay)
   - RARE: ascending tone (sine sweep 400→800Hz, 150ms)
   - ULTRA_RARE: multi-note stinger (arpeggiated: 400, 500, 630Hz, 60ms each)
   - SECRET_RARE: dramatic stinger (chord: 300, 450, 600Hz simultaneous, 400ms, reverb)

5. rarityStinger(rarity) — plays after flip midpoint, distinct from flipTick:
   - COMMON: silence
   - UNCOMMON: single soft chime
   - RARE: ascending 3-note run
   - ULTRA_RARE: triumphant 4-note fanfare
   - SECRET_RARE: full dramatic swell (layered sine waves, amplitude envelope 0→peak over 200ms, hold 300ms, decay 500ms)

6. snapBack() — spring boing: sine 200Hz, pitch bend up then down over 200ms.

Export: { initAudio, crinkleSound, tearPop, cardSlideIn, flipTick, rarityStinger, snapBack, setMasterVolume }
```

---

## Phase 9 — Particle Effects

**What gets built:** `src/scene/effects/particles.js`  
GPU-friendly point-based particle systems for each rarity tier, screen-space god rays for Ultra Rare+.

**Prompt:**
```
Implement the particle effects system for Rips & Hits in src/scene/effects/particles.js.

Use Three.js Points (BufferGeometry + PointsMaterial) — no external physics lib.

All particle systems share the same update(dt) → returns true while alive, false when done (caller disposes).

Implement these emitters:

1. subtleSparkle({ position, scene }) — UNCOMMON
   - 30 particles, small white points (size 0.02), burst outward slowly, fade over 0.8s
   - Velocity: random sphere direction, speed 0.3–0.8 units/s, gravity -0.5

2. goldDustBurst({ position, scene }) — RARE
   - 80 particles, gold color (#f5c842), size 0.03–0.05 random
   - Initial velocity: upward cone (±30° from +Y), speed 1–2.5 units/s
   - Gravity -1.5, drag 0.97/frame, fade over 1.2s

3. prismaticCascade({ position, scene }) — ULTRA_RARE
   - 200 particles, rainbow cycling colors (hue = particleIndex/200, cycled over time)
   - Burst in full sphere, speed 1.5–4 units/s, gravity -2, drag 0.96, lifetime 1.8s
   - Add 20 larger "star" particles (size 0.08) that twinkle (opacity sine wave 8Hz)

4. massiveExplosion({ position, scene }) — SECRET_RARE
   - 500 particles, rainbow + white mix
   - Two waves: first burst at t=0 (300 particles, speed 2–6), second at t=0.15s (200 particles, speed 1–3)
   - Add screen-shake: export shakeCamera(camera, intensity, duration) — translate camera by random ±intensity vec3, decay over duration (spring)
   - Lifetime 2.5s, gravity -1, drag 0.98

Screen-space god rays (ULTRA_RARE+):
- Not true volumetric — CSS overlay on the canvas: create a div with radial-gradient from card center, white to transparent, opacity animated 0→0.6→0 over 0.6s
- For SECRET_RARE: 3 animated gradient divs at different angles rotating slowly, opacity 0.4 each

Export: { subtleSparkle, goldDustBurst, prismaticCascade, massiveExplosion, shakeCamera, createScreenFlash }
createScreenFlash(rarity, domElement): injects a full-screen div overlay per rarity table — WHITE for RARE, full white flash for ULTRA_RARE, full white then darken for SECRET_RARE.
```

---

## Phase 10 — Price Integration

**What gets built:** price fetching in `src/data/cards.js`, price display in reveal flow  
Free API (Scryfall-style via TCGPlayer free tier or PokéTCG API), localStorage 24h TTL cache.

**Prompt:**
```
Implement market price display for Rips & Hits.

Requirements from PLAN.md: "Market prices visible on reveal without a paid API."

Use the PokéAPI-TCG free endpoint for Pokémon cards and a static price map for One Piece (no free One Piece price API exists).

src/data/cards.js — add:

async function fetchCardPrice(card):
- Cache key: "price_" + card.id in localStorage
- Cache TTL: 24 hours (store { price, fetchedAt } as JSON)
- If cache hit and age < 24h: return cached price
- For card.game === "pokemon":
  - Fetch https://api.pokemontcg.io/v2/cards?q=name:{card.name}&pageSize=1
  - No API key needed for basic use (rate limited to 1000/day)
  - Extract prices.market or prices.mid from cardmarket or tcgplayer nested object
  - Fallback chain: tcgplayer.prices.holofoil.market → tcgplayer.prices.normal.market → cardmarket.prices.averageSellPrice → null
- For card.game === "onepiece": return null (no free API)
- On network error: return null (never throw, never block reveal)
- Store result in cache regardless (null is cached too, to prevent hammering on error)

Price display:
- In src/scene/cards/revealController.js, after the 1.5s post-flip delay, call fetchCardPrice(card)
- Inject an absolutely-positioned HTML div below the card (positioned via CSS, not Three.js):
  - Show "Loading price…" while fetching (if fetch is slow)
  - Show "$X.XX" in --accent color when resolved, or "—" if null
  - Fade in via CSS opacity transition 0.4s
  - Font: bold, 1.2rem
- The div is appended to the same DOM container as the canvas and removed on card dismiss.
```

---

## Phase 11 — Collection Persistence

**What gets built:** `src/state/collection.js`, updates to `src/app/screens/collection.js`  
localStorage collection, "new!" badge logic, collection grid with rarity color coding.

**Prompt:**
```
Implement the collection persistence layer and collection screen for Rips & Hits.

src/state/collection.js:
- localStorage key: "rips-collection" — array of { id, name, setId, rarity, imageFront, marketPrice, addedAt (ISO string) }
- Export:
  - addCards(cardArray) — append to collection, skip duplicates by id (but allow multiple copies: use id + "-" + Date.now() for storage key)
  - Actually: allow duplicates (you can pull the same card twice). Store each pull as a separate entry with a unique pullId (nanoid or Date.now()).
  - getCollection() → full array sorted by addedAt desc
  - getCardsByRarity(rarity) → filtered array
  - clearCollection() — for debug only, behind a confirmation
  - collectionStats() → { total, byRarity: { COMMON: n, … }, uniqueCards: n }

src/app/screens/collection.js — full implementation:
- Header: "My Collection" + stats bar (e.g., "42 cards · 3 holos")
- Filter tabs: All | Common | Uncommon | Rare | Ultra Rare | Secret Rare
- Card grid: 3 columns, each card shows imageFront (or colored placeholder), card name, rarity badge
- Rarity badge colors: COMMON=grey, UNCOMMON=silver, RARE=gold, ULTRA_RARE=purple, SECRET_RARE=rainbow CSS animation
- "New!" badge: cards added in the last session (store sessionStart in sessionStorage, compare to addedAt)
- Tapping a card opens a modal with full card details + market price
- Empty state with CTA button to navigate to #home

In revealController.js: after "allComplete", call addCards(revealedCards) to persist the session's pulls.
```

---

## Phase 12 — Open Screen Integration

**What gets built:** Wire up `src/app/screens/open.js` with all Phase 1–11 systems  
Full open flow: canvas injection → pack 3D → tear gesture → card reveal → summary → persist to collection.

**Prompt:**
```
Wire up the complete Open screen in src/app/screens/open.js, connecting all previously built systems.

The open screen is the core 90% polish experience. Flow:

mount(container):
1. Read selectedSetId from sessionStorage (set by home screen on pack tap)
2. Load set + cards via CardSource (shuffle, draw N cards per pack: 5 commons, 3 uncommons, 1 rare, 1 rare+ using pulls.js weighted logic)
3. Inject the Three.js canvas (from renderer.js) into container. Canvas fills the viewport.
4. Create the pack (createPack) centered in scene.
5. Show instructions overlay: "Grab the tab and pull" with a subtle animated arrow pointing to the tab.
6. Enable pack rotation (interactive before tearing).
7. On tab grab (gesture "grab" event):
   - Hide instructions overlay
   - initAudio() (satisfies autoplay policy)
   - Switch to tear mode
8. Each frame of tearing: crinkleSound(velocity), update tearStrip.
9. On "nudge" event: show "Keep pulling!" toast for 2s.
10. On tearPop() (t=1.0): play tearPop audio, trigger strip detach animation.
11. After strip animation (~1.2s): slide cards up one by one using revealController.
12. Per "rarityReveal" event: trigger correct particle emitter + screen flash + rarityStinger.
13. Per "cardComplete": nothing (revealController auto-advances commons, waits for tap on rare+).
14. On "allComplete":
    - addCards(revealedCards) to collection
    - Show results summary overlay: "You opened X cards!" with rarity tally, value if prices loaded
    - Two buttons: "Rip Another" (remounts open screen) and "View Collection" (navigateTo('#collection'))

src/game/pulls.js:
- drawPack(setId, cardSource) → Promise<Card[]>
- Weighted draw: 5 COMMON, 3 UNCOMMON, 1 RARE, 1 slot that is RARE 60% / ULTRA_RARE 30% / SECRET_RARE 10%
- Shuffle the result array before returning

unmount(): dispose renderer, tearStrip, revealController, particles, remove canvas, remove DOM overlays.
```

---

## Phase 13 — Fast-Open Mode

**What gets built:** Fast-open flow, batch opening UI, skip-animation logic  
Bulk open 20 packs in under 60s (from success criteria).

**Prompt:**
```
Implement fast-open mode for Rips & Hits. This must be built-in from day one per PLAN.md, not retrofitted.

Fast-open is triggered from the home screen: long-press a pack (500ms hold) or a "Fast Open" secondary button.

src/app/screens/open.js additions:
- openFast(setId, packCount = 20) function alongside the normal mount()
- Fast-open skips all animations: no 3D pack rotation, no tear strip animation, no pre-flip glow delay
- Instead: draw all packs' cards at once (packCount × drawPack calls in parallel with Promise.all)
- Show a rapid card-flip grid: cards appear in a 3×N scrollable grid, flipping face-up instantly at 100ms intervals
- Each card still shows its rarity badge and "New!" indicator
- Rare+ cards get a subtle 200ms glow flash (not the full particle show) — the experience is fast but still satisfying
- Audio: a single rapid "flip-flip-flip" ticker sound (flipTick at high speed, one per 100ms interval)
- After all cards shown: same results summary as normal open
- All cards persist to collection exactly the same way

Performance target: 20 packs (200 cards) revealed in under 60s total. The 100ms interval × 200 cards = 20s. That's fine.

Home screen update:
- Add long-press detection (pointerdown → 500ms timeout → trigger fast-open; pointerup before 500ms = normal open)
- Show a small "Fast Open (20 packs)" tooltip that appears after 200ms of holding
```

---

## Phase 14 — Pack Wizard (Custom Packs)

**What gets built:** `/packs/` JSON config schema, `PackPoolResolver`, wizard UI  
Non-developer can add a pack in under 5 minutes via a config file + optional wizard UI.

**Prompt:**
```
Implement the custom pack system for Rips & Hits.

The design: packs are defined by JSON config files in /public/packs/{packId}.json. No code changes needed to add a pack.

/public/packs/schema.json (document the schema):
{
  "id": "string (unique, url-safe)",
  "name": "string",
  "game": "pokemon | onepiece | custom",
  "packArt": "path to pack art image relative to /public/",
  "cardBackPath": "path to card back image",
  "cards": [
    { "id": "string", "name": "string", "rarity": "COMMON|UNCOMMON|RARE|ULTRA_RARE|SECRET_RARE", "imageFront": "path", "marketPrice": number | null }
  ],
  "packRules": {
    "totalCards": 10,
    "slots": [
      { "count": 5, "rarity": "COMMON" },
      { "count": 3, "rarity": "UNCOMMON" },
      { "count": 1, "rarity": "RARE" },
      { "count": 1, "rarityWeights": { "RARE": 0.6, "ULTRA_RARE": 0.3, "SECRET_RARE": 0.1 } }
    ]
  }
}

src/game/cardSource.js update:
- PackPoolResolver: loadPack(packId) first checks /public/packs/{packId}.json; if found, uses that config directly, bypassing cards.json/sets.json. Falls back to the existing adapter for built-in sets.
- drawPackFromConfig(packConfig) implements slot-based drawing per packRules.

Wizard UI (src/app/screens/home.js addition or new src/app/screens/wizard.js):
- A step-by-step form accessible via an "+" button on the home screen
- Step 1: Pack name + game type
- Step 2: Upload pack art image (converts to base64, stored in localStorage "custom-packs")
- Step 3: Add cards — name, rarity, optional image upload, optional price
- Step 4: Set pack rules (use defaults)
- Step 5: Preview + "Save Pack"
- Saved custom packs appear on the home shelf alongside built-in packs
- Custom packs stored in localStorage "custom-packs" as array of pack config objects (PackPoolResolver checks this before fetching JSON files)

Target: a non-developer can create a custom pack in under 5 minutes.
```

---

## Phase 15 — Performance & PWA Polish

**What gets built:** Load optimization, service worker, performance audits  
Under 3s load on mid-range Android LTE, PWA manifest, offline support for opened cards.

**Prompt:**
```
Implement performance optimization and PWA setup for Rips & Hits.

Performance targets from PLAN.md:
- App loads in under 3s on a mid-range Android on LTE
- Fast-open 20 packs in under 60s
- DPR cap already enforced — verify it's in place

vite.config.js updates:
- Code splitting: separate chunks for Three.js, game logic, and app shell
- Manually set rollupOptions.output.manualChunks: { 'three': ['three'], 'game': ['src/game/...'], 'app': ['src/app/...'] }
- Enable gzip/brotli hints (Vite does this by default; confirm build output)
- Asset inlining threshold: 4096 bytes (inline small textures as base64)

Texture/asset loading:
- All card textures lazy-load (not on app start). Only the pack art for the selected pack loads on the Open screen.
- Placeholder canvas textures (from Phase 6) load instantly — no network dependency for core experience.
- Add a simple loading progress indicator on the Open screen: "Loading pack… 60%"

public/manifest.json (PWA):
{
  "name": "Rips & Hits",
  "short_name": "Rips & Hits",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0a0f",
  "theme_color": "#0a0a0f",
  "icons": [{ "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" }, { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }]
}
- Generate placeholder 192×192 and 512×512 dark icons (canvas-generated PNG or simple SVG converted)
- Add <link rel="manifest"> to index.html

Service worker (public/sw.js):
- Cache-first for all static assets (JS, CSS, textures, audio)
- Network-first for /data/*.json and price API calls (with cache fallback)
- Register in main.js after app init: if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js')
- Offline: collection screen works fully offline (localStorage). Open screen shows cached pack data if available, or graceful "No connection" message.

Final audit checklist to verify in the prompt response:
- [ ] DPR cap confirmed in renderer.js
- [ ] Tab hidden → loop paused (visibilitychange)
- [ ] No Three.js objects leak (all dispose() calls wired)
- [ ] localStorage writes are synchronous and small (no large textures in localStorage)
- [ ] Price fetches never block the reveal flow (all async, fire-and-forget)
```

---

## Quick Reference — File Map

```
src/
  main.js                          Phase 1
  scene/
    renderer.js                    Phase 1
    pack/
      pack.js                      Phase 4
      tearStrip.js                 Phase 5
    cards/
      textures.js                  Phase 6
      card.js                      Phase 6
      revealController.js          Phase 6 + Phase 10 (price) + Phase 12 (wiring)
      holoMaterial.js              Phase 7
    effects/
      particles.js                 Phase 9
  game/
    rarity.js                      Phase 2
    cardSource.js                  Phase 2 + Phase 14 (PackPoolResolver)
    pulls.js                       Phase 12
  data/
    cards.js                       Phase 2 + Phase 10 (price)
  app/
    router.js                      Phase 3
    screens/
      home.js                      Phase 3 + Phase 13 (fast-open) + Phase 14 (wizard)
      open.js                      Phase 3 (stub) → Phase 12 (full)
      collection.js                Phase 3 (stub) → Phase 11 (full)
      community.js                 Phase 3 (stub)
      profile.js                   Phase 3 (stub)
  audio/
    sound.js                       Phase 8
  state/
    collection.js                  Phase 11
  interact/
    gestures.js                    Phase 5
  shaders/
    holo.vert.glsl                 Phase 7
    holo.frag.glsl                 Phase 7
  styles/
    main.css                       Phase 3
public/
  data/
    cards.json                     Phase 2
    sets.json                      Phase 2
  packs/
    schema.json                    Phase 14
  manifest.json                    Phase 15
  sw.js                            Phase 15
```

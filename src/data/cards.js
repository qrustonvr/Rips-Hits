// cards.js — re-exports all pack definitions from src/data/packs/.
//
// Each pack JSON lives in src/data/packs/{id}.json and is authored by the
// pack-creator skill (or a developer). This file just collects them so the
// rest of the app has one import point.
//
// To add a new pack: drop a JSON file into src/data/packs/ and import it here.

import pokemon151 from './packs/pokemon-151.json';
import charizardLine from './packs/charizard-line.json';

export const PACKS = [
  pokemon151,
  charizardLine,
];
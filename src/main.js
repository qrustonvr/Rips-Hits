// Rips & Hits — boot
import { Router } from './app/router.js';
import { SceneManager } from './scene/renderer.js';
import { home } from './app/screens/home.js';
import { collection } from './app/screens/collection.js';
import { open } from './app/screens/open.js';
import { initBankrollDisplay } from './state/collection.js';

const scene = new SceneManager(document.getElementById('gl'));

const router = new Router(document.getElementById('screen'), {
  home,
  collection,
  open,
}, scene);

// Seed bankroll display from localStorage
initBankrollDisplay();

router.go('home');
scene.start();

// Shared canvas textures for cards — built once, reused by every card.
// The BACK is identical for all cards (rarity stays secret until the glow),
// and the GLOW sprite is a soft radial alpha we tint per-rarity.
import * as THREE from 'three';

let _back = null;
let _glow = null;

export function cardBackTexture() {
  if (_back) return _back;
  const s = 512;
  const c = document.createElement('canvas');
  c.width = s; c.height = Math.round(s * 1.4);
  const g = c.getContext('2d');
  const W = c.width, H = c.height;

  // deep base
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#171a2b');
  bg.addColorStop(0.5, '#0e1020');
  bg.addColorStop(1, '#1b1430');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  // diagonal weave
  g.strokeStyle = 'rgba(120,140,255,0.06)';
  g.lineWidth = 3;
  for (let i = -H; i < W; i += 26) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + H, H); g.stroke();
  }
  g.strokeStyle = 'rgba(255,120,200,0.05)';
  for (let i = -H; i < W; i += 26) {
    g.beginPath(); g.moveTo(i + H, 0); g.lineTo(i, H); g.stroke();
  }

  // outer frame
  g.strokeStyle = 'rgba(182,255,60,0.55)';
  g.lineWidth = 10;
  roundRect(g, 22, 22, W - 44, H - 44, 28); g.stroke();
  g.strokeStyle = 'rgba(70,232,224,0.35)';
  g.lineWidth = 4;
  roundRect(g, 40, 40, W - 80, H - 80, 22); g.stroke();

  // center monogram
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.font = `bold ${Math.round(W * 0.34)}px system-ui, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('R&H', W / 2, H / 2 - 10);
  g.fillStyle = 'rgba(182,255,60,0.8)';
  g.font = `600 ${Math.round(W * 0.06)}px system-ui, sans-serif`;
  g.fillText('RIPS & HITS', W / 2, H / 2 + W * 0.26);

  _back = new THREE.CanvasTexture(c);
  _back.colorSpace = THREE.SRGBColorSpace;
  _back.anisotropy = 4;
  return _back;
}

export function glowTexture() {
  if (_glow) return _glow;
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(s / 2, s / 2, s * 0.18, s / 2, s / 2, s * 0.5);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  _glow = new THREE.CanvasTexture(c);
  return _glow;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

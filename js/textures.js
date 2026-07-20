// ============================================================
// Elementum 3D — Texture generation via 2D canvas
// Each element cube gets a top-face texture (number, symbol, name, mass)
// and a side-face textures (gradient + symbol).
// ============================================================

import * as THREE from "three";

const textureCache = new Map(); // key: `${el.n}:face:${color}`

// Build a high-res canvas texture for an element face
function makeFaceTexture(el, face, color, theme) {
  const key = `${el.n}:${face}:${color}:${theme}`;
  if (textureCache.has(key)) return textureCache.get(key);

  const S = 512; // texture size in px
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d");

  // Background — dark with subtle category tint
  const isDark = theme !== "mono";
  const bg = isDark ? "#0a0d1f" : "#ffffff";
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, S, S);

  if (face === "top") {
    // gradient overlay
    const grad = ctx.createLinearGradient(0, 0, S, S);
    grad.addColorStop(0, hexA(color, isDark ? 0.42 : 0.85));
    grad.addColorStop(1, hexA(color, isDark ? 0.10 : 0.45));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, S, S);

    // border
    ctx.strokeStyle = hexA(color, 0.85);
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, S - 6, S - 6);

    // atomic number (top-left)
    ctx.fillStyle = isDark ? "#ffffff" : "#1a1f2e";
    ctx.font = "700 44px 'Roboto Mono', monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(String(el.n), 28, 24);

    // symbol (center, large)
    ctx.fillStyle = isDark ? "#ffffff" : "#1a1f2e";
    ctx.font = "800 200px 'Exo', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(el.sym, S / 2, S / 2 - 10);

    // name (below symbol)
    ctx.font = "500 36px 'Exo', sans-serif";
    ctx.fillStyle = isDark ? hexA("#ffffff", 0.85) : "#5a6178";
    ctx.fillText(el.name.toUpperCase(), S / 2, S / 2 + 130);

    // mass (bottom)
    ctx.font = "400 30px 'Roboto Mono', monospace";
    ctx.fillStyle = isDark ? hexA("#ffffff", 0.65) : "#9aa0b5";
    ctx.fillText(el.mass, S / 2, S - 36);
  } else {
    // side face: vertical gradient + symbol watermark
    const grad = ctx.createLinearGradient(0, 0, 0, S);
    grad.addColorStop(0, hexA(color, isDark ? 0.7 : 0.9));
    grad.addColorStop(1, hexA(color, isDark ? 0.15 : 0.4));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, S, S);

    // big translucent symbol
    ctx.fillStyle = hexA(isDark ? "#ffffff" : "#1a1f2e", 0.18);
    ctx.font = "800 320px 'Exo', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(el.sym, S / 2, S / 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  textureCache.set(key, tex);
  return tex;
}

// helper: hex + alpha
function hexA(hex, a) {
  if (!hex || !hex.startsWith("#")) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// Public API: returns an array of 6 materials for a BoxGeometry, one per face
// Order in three.js BoxGeometry: +x, -x, +y (top), -y (bottom), +z, -z
export function makeElementMaterials(el, color, theme) {
  const sideTex = makeFaceTexture(el, "side", color, theme);
  const topTex = makeFaceTexture(el, "top", color, theme);

  const sideMat = new THREE.MeshStandardMaterial({
    map: sideTex,
    roughness: 0.5,
    metalness: 0.3,
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.06,
  });
  const topMat = new THREE.MeshStandardMaterial({
    map: topTex,
    roughness: 0.4,
    metalness: 0.35,
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.12,
  });
  const botMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color).multiplyScalar(0.25),
    roughness: 0.7,
    metalness: 0.2,
  });

  return [
    sideMat, sideMat, // +x, -x
    topMat,           // +y (top)
    botMat,           // -y (bottom)
    sideMat, sideMat, // +z, -z
  ];
}

// Clear cache (on theme/color change)
export function clearTextureCache() {
  textureCache.forEach((t) => t.dispose?.());
  textureCache.clear();
}

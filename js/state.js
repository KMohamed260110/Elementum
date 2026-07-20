// ============================================================
// Elementum 3D — Central state store (tiny pub/sub)
// ============================================================

export const THEMES = [
  { id: "nebula",  label: "Nebula" },
  { id: "aurora",  label: "Aurora" },
  { id: "sunset",  label: "Sunset" },
  { id: "mono",    label: "Mono" },
  { id: "forest",  label: "Forest" },
  { id: "inferno", label: "Inferno" },
];

// Default category colors (matches nebula theme). Other themes override via CSS.
export const DEFAULT_CAT_COLORS = {
  "alkali-metal":     "#ff6b6b",
  "alkaline-earth":   "#ffa94d",
  "transition-metal": "#ffd43b",
  "post-transition":  "#69db7c",
  "metalloid":        "#38d9a9",
  "nonmetal":         "#4dabf7",
  "halogen":          "#5c7cfa",
  "noble-gas":        "#cc5de8",
  "lanthanide":       "#f783ac",
  "actinide":         "#e599f7",
  "unknown":          "#868e96",
};

export const CAT_LABELS = {
  "alkali-metal":     "Alkali Metals",
  "alkaline-earth":   "Alkaline Earth",
  "transition-metal": "Transition Metals",
  "post-transition":  "Post-Transition",
  "metalloid":        "Metalloids",
  "nonmetal":         "Nonmetals",
  "halogen":          "Halogens",
  "noble-gas":        "Noble Gases",
  "lanthanide":       "Lanthanides",
  "actinide":         "Actinides",
  "unknown":          "Unknown",
};

// Singleton state
export const state = {
  theme: "nebula",
  activeCats: new Set(),       // empty = all visible
  searchQuery: "",
  customColors: {},            // {category: "#hex"}
  selectedEl: null,            // element object or null
  reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
};

// ----- pub/sub -----
const listeners = new Map(); // event -> Set<fn>
export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event)?.delete(fn);
}
export function emit(event, payload) {
  listeners.get(event)?.forEach((fn) => {
    try { fn(payload); } catch (e) { console.error("listener error", e); }
  });
}

// ----- theme handling -----
// Read the *active* (computed) category color, honoring custom overrides then CSS var fallback.
export function getCatColor(cat) {
  if (state.customColors[cat]) return state.customColors[cat];
  // read from CSS variable on body
  const css = getComputedStyle(document.body)
    .getPropertyValue(`--cat-${cat}`)
    .trim();
  return css || DEFAULT_CAT_COLORS[cat] || "#888888";
}

// ----- persistence -----
const LS_KEYS = {
  theme: "e3d_theme",
  custom: "e3d_custom_colors",
};

export function loadPrefs() {
  try {
    const t = localStorage.getItem(LS_KEYS.theme);
    if (t && THEMES.find((x) => x.id === t)) state.theme = t;
    const c = localStorage.getItem(LS_KEYS.custom);
    if (c) state.customColors = JSON.parse(c);
  } catch {}
}

export function savePrefs() {
  try {
    localStorage.setItem(LS_KEYS.theme, state.theme);
    localStorage.setItem(LS_KEYS.custom, JSON.stringify(state.customColors));
  } catch {}
}

export function applyTheme(themeId) {
  state.theme = themeId;
  document.body.className = document.body.className
    .replace(/theme-\S+/g, "")
    .trim();
  document.body.classList.add(`theme-${themeId}`);
  savePrefs();
  emit("theme", themeId);
}

export function setCustomColor(cat, hex) {
  if (hex) state.customColors[cat] = hex;
  else delete state.customColors[cat];
  savePrefs();
  emit("colors", state.customColors);
}

export function clearCustomColors() {
  state.customColors = {};
  savePrefs();
  emit("colors", state.customColors);
}

export function setSearch(q) {
  state.searchQuery = (q || "").toLowerCase().trim();
  emit("filter");
}

export function toggleCategory(catId) {
  if (state.activeCats.has(catId)) state.activeCats.delete(catId);
  else state.activeCats.add(catId);
  emit("filter");
}

export function clearCategories() {
  state.activeCats.clear();
  emit("filter");
}

export function resetAll() {
  state.activeCats.clear();
  state.searchQuery = "";
  state.customColors = {};
  savePrefs();
  document.getElementById("search").value = "";
  emit("filter");
  emit("colors", state.customColors);
}

// Returns true if element passes current filter
export function isVisible(el) {
  // search
  if (state.searchQuery) {
    const q = state.searchQuery;
    const matches =
      el.name.toLowerCase().includes(q) ||
      el.sym.toLowerCase().includes(q) ||
      String(el.n) === q;
    if (!matches) return false;
  }
  // category
  if (state.activeCats.size > 0 && !state.activeCats.has(el.cat)) return false;
  return true;
}

// Returns true if element is "highlighted" (passes category filter regardless of search)
export function isHighlighted(el) {
  if (state.activeCats.size === 0) return false;
  return state.activeCats.has(el.cat);
}

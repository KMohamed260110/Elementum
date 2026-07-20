// ============================================================
// Elementum 3D — Main entry: wires UI to 3D scene + state
// ============================================================

import { initScene, setupClickDetection, deselectFromUI } from "./scene.js";
import {
  state, CAT_LABELS,
  on, emit, applyTheme, loadPrefs,
  setSearch, toggleCategory, clearCategories,
  getCatColor,
} from "./state.js";
import { ELEMENTS } from "../data/elements.js";

// ---------- Bootstrap ----------
loadPrefs();
applyTheme(state.theme);

const canvas = document.getElementById("scene-canvas");
initScene(canvas);
setupClickDetection();

buildCategoryList();
wireHeader();
wireDetailPanel();

// Hide loader after first frame
requestAnimationFrame(() => {
  setTimeout(() => {
    document.getElementById("loader").classList.add("hidden");
  }, 600);
});

// Auto-hide status bar after 8s
setTimeout(() => {
  document.getElementById("status-bar").classList.add("fade");
}, 8000);

// ---------- Category list ----------
function buildCategoryList() {
  const list = document.getElementById("category-list");
  list.innerHTML = "";

  // Count per category
  const counts = {};
  ELEMENTS.forEach((el) => { counts[el.cat] = (counts[el.cat] || 0) + 1; });

  Object.keys(CAT_LABELS).forEach((catId) => {
    const color = getCatColor(catId);
    const chip = document.createElement("button");
    chip.className = "category-chip";
    chip.dataset.cat = catId;
    chip.style.setProperty("--chip-color", color);
    chip.innerHTML = `
      <span class="cat-dot"></span>
      <span class="cat-label">${CAT_LABELS[catId]}</span>
      <span class="cat-count">${counts[catId] || 0}</span>
    `;
    chip.addEventListener("click", () => {
      toggleCategory(catId);
      chip.classList.toggle("active", state.activeCats.has(catId));
      // Update visible count
      emit("filter");
    });
    list.appendChild(chip);
  });

  // Clear button
  const clearBtn = document.createElement("button");
  clearBtn.className = "category-chip";
  clearBtn.style.justifyContent = "center";
  clearBtn.style.marginTop = "8px";
  clearBtn.style.border = "1px dashed var(--border-hi)";
  clearBtn.innerHTML = `<span class="cat-label" style="text-align:center;color:var(--text-muted)">CLEAR FILTERS</span>`;
  clearBtn.addEventListener("click", () => {
    clearCategories();
    document.querySelectorAll(".category-chip[data-cat]").forEach((c) => c.classList.remove("active"));
    toast("Filters cleared");
  });
  list.appendChild(clearBtn);
}

// ---------- Header buttons ----------
function wireHeader() {
  const search = document.getElementById("search");
  let debounce;
  search.addEventListener("input", (e) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => setSearch(e.target.value), 120);
  });

  document.getElementById("btn-toggle-menu").addEventListener("click", () => {
    document.getElementById("floating-menu").classList.toggle("hidden");
  });


}

// ---------- Detail panel ----------
function wireDetailPanel() {
  const panel = document.getElementById("detail-panel");
  document.getElementById("detail-close").addEventListener("click", closeDetail);
  document.getElementById("detail-backdrop").addEventListener("click", closeDetail);

  // Open detail when an element is selected in the 3D scene
  on("select", (el) => {
    openDetail(el);
  });
}

function openDetail(el) {
  const panel = document.getElementById("detail-panel");
  const color = getCatColor(el.cat);

  document.getElementById("detail-symbol").textContent = el.sym;
  document.getElementById("detail-symbol").style.setProperty("--el-color", color);
  document.getElementById("detail-name").textContent = el.name;
  document.getElementById("detail-num").textContent = `ATOMIC NUMBER ${el.n}`;
  const catBadge = document.getElementById("detail-cat");
  catBadge.textContent = CAT_LABELS[el.cat] || el.cat;
  document.getElementById("detail-fact").textContent = el.fact;

  // Set CSS var on the whole card for theming
  document.getElementById("detail-card").style.setProperty("--el-color", color);

  // Properties grid
  const grid = document.getElementById("detail-grid");
  const fmt = (v, suffix = "") => (v === null || v === undefined || v === "" ? "—" : `${v}${suffix}`);
  const props = [
    { k: "Atomic Mass", v: fmt(el.mass, " u") },
    { k: "Year Discovered", v: el.year === null ? "Ancient" : String(el.year) },
    { k: "Electronegativity", v: fmt(el.en, " (Pauling)") },
    { k: "Atomic Radius", v: fmt(el.radius, " pm") },
    { k: "Melting Point", v: fmt(el.melt, " °C") },
    { k: "Boiling Point", v: fmt(el.boil, " °C") },
    { k: "Group", v: String(el.group) },
    { k: "Period", v: String(el.period) },
  ];
  grid.innerHTML = props.map((p) =>
    `<div class="detail-cell"><div class="key">${p.k}</div><div class="val">${p.v}</div></div>`
  ).join("") +
    `<div class="detail-cell wide"><div class="key">Electron Configuration</div><div class="val config">${el.config}</div></div>`;

  panel.classList.add("open");
}

function closeDetail() {
  const panel = document.getElementById("detail-panel");
  panel.classList.remove("open");
  deselectFromUI();
}

// ---------- Toast ----------
let toastTimer;
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}
window.__toast = toast;



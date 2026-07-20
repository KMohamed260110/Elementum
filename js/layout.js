// ============================================================
// Elementum 3D — Layout: maps each element to a 3D grid position
// Mirrors the standard periodic-table layout.
// ============================================================

import { ELEMENTS } from "../data/elements.js";

// Cell dimensions in world units
export const CELL = 1.5;       // width/depth of each cell
export const CELL_GAP = 0.18;  // gap between cells
export const CELL_PITCH = CELL + CELL_GAP;
export const CELL_HEIGHT = 0.7; // height (thickness) of cube

export const COLS = 18;
export const ROWS = 10; // 7 main + spacer + 2 f-block rows

// Center the grid around origin
export const GRID_W = COLS * CELL_PITCH;
export const GRID_D = ROWS * CELL_PITCH;
export const GRID_OFFSET_X = -GRID_W / 2 + CELL_PITCH / 2;
export const GRID_OFFSET_Z = -GRID_D / 2 + CELL_PITCH / 2;


// Map element to grid (col, row) — same logic as the original site.
export function gridPos(el) {
  let col, row;
  if (el.n >= 57 && el.n <= 71) {
    // lanthanides
    col = 3 + (el.n - 57); // columns 4..18
    row = 8;               // 0-indexed row 8 (= 9th row)
  } else if (el.n >= 89 && el.n <= 103) {
    col = 3 + (el.n - 89);
    row = 9;               // 0-indexed row 9 (= 10th row)
  } else {
    col = el.group - 1;    // 0-indexed
    row = el.period - 1;   // 0-indexed
  }
  return { col, row };
}

// Convert (col, row) to world (x, z) coordinates (Y is up)
export function gridToWorld(col, row) {
  const x = GRID_OFFSET_X + col * CELL_PITCH;
  const z = GRID_OFFSET_Z + row * CELL_PITCH;
  return { x, z };
}

// Precompute layout for all elements
export const LAYOUT = ELEMENTS.map((el) => {
  const { col, row } = gridPos(el);
  const { x, z } = gridToWorld(col, row);
  return {
    el,
    col, row,
    x, z,
    // base Y (sits with top at 0)
    y: CELL_HEIGHT / 2,
  };
});

// Labels for f-block indicator cells
export const F_BLOCK_LABELS = [
  { text: "57–71\nLANTHANIDES", col: 0, row: 8, span: 3 },
  { text: "89–103\nACTINIDES", col: 0, row: 9, span: 3 },
];

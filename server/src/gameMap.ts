// ══════════════════════════════════════════════════════════════════════════════
//  HAWKINS LAB — Server-Side Tilemap
//  Mirrors the client-side map exactly (app/src/data/gameMap.ts)
// ══════════════════════════════════════════════════════════════════════════════

import { CONFIG } from './types.js';

export type TileId = 0 | 1 | 2;  // 0=floor, 1=wall, 2=floor-variant

function generateMap(): TileId[][] {
  const size = CONFIG.WORLD_SIZE;
  const map: TileId[][] = Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => {
      // Border walls
      if (row === 0 || row === size - 1 || col === 0 || col === size - 1) return 1;
      // Internal rooms — simple predefined wall islands
      if (row % 10 === 5 && col > 5 && col < size - 5 && col % 4 !== 0) return 1;
      if (col % 10 === 5 && row > 5 && row < size - 5 && row % 4 !== 0) return 1;
      // Floor variants for texture
      if ((row + col) % 7 === 0) return 2;
      return 0;
    })
  );
  return map;
}

export const GAME_MAP: TileId[][] = generateMap();

/** O(1) wall check — returns true if tile at (tx, ty) is a wall */
export function isWall(tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= CONFIG.WORLD_SIZE || ty >= CONFIG.WORLD_SIZE) return true;
  return GAME_MAP[ty][tx] === 1;
}

/** Get a random non-wall tile coordinate */
export function randomFloorTile(): { x: number; y: number } {
  let x: number, y: number;
  do {
    x = Math.floor(Math.random() * (CONFIG.WORLD_SIZE - 2)) + 1;
    y = Math.floor(Math.random() * (CONFIG.WORLD_SIZE - 2)) + 1;
  } while (isWall(x, y));
  return { x, y };
}

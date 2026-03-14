import { useState, useEffect, useCallback } from 'react';
import { GAME_MAP } from '../data/gameMap';
import { gpsToWorld, WORLD_SIZE } from '../utils/gpsToWorld';

export type Direction = 'up' | 'down' | 'left' | 'right';

interface Options {
  initialGpsX?: number;
  initialGpsY?: number;
  initialTx?: number;
  initialTy?: number;
  onMove?: (tx: number, ty: number) => void;
}

export function usePlayerMovement({ initialGpsX = 0, initialGpsY = 0, initialTx, initialTy, onMove }: Options = {}) {
  const start = initialTx !== undefined && initialTy !== undefined
    ? { tx: initialTx, ty: initialTy }
    : gpsToWorld(initialGpsX, initialGpsY);

  const [pos, setPos] = useState<{ tx: number; ty: number }>(start);

  const move = useCallback((dir: Direction) => {
    setPos(({ tx, ty }) => {
      let nx = tx;
      let ny = ty;
      if (dir === 'up')    ny--;
      if (dir === 'down')  ny++;
      if (dir === 'left')  nx--;
      if (dir === 'right') nx++;

      // Clamp to navigable bounds
      nx = Math.max(1, Math.min(WORLD_SIZE - 2, nx));
      ny = Math.max(1, Math.min(WORLD_SIZE - 2, ny));

      // Reject if target tile is a wall
      if ((GAME_MAP[ny]?.[nx] ?? 1) === 1) return { tx, ty };

      if (onMove) onMove(nx, ny);
      return { tx: nx, ty: ny };
    });
  }, [onMove]);

  // Keyboard support — WASD and arrow keys
  useEffect(() => {
    const DIR_MAP: Record<string, Direction> = {
      ArrowUp: 'up',    w: 'up',
      ArrowDown: 'down', s: 'down',
      ArrowLeft: 'left', a: 'left',
      ArrowRight: 'right', d: 'right',
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      const dir = DIR_MAP[e.key];
      if (dir) {
        e.preventDefault();
        move(dir);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [move]);

  return { tx: pos.tx, ty: pos.ty, move };
}

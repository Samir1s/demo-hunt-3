import { motion } from 'framer-motion';
import { useGameStore } from '../../store/gameStore';
import clsx from 'clsx';

// ── Radar Config ─────────────────────────────────────────────────────────────
const RADAR_VIEW_RADIUS = 12;            // tiles visible on radar (zoom level)
const EDGE_CLAMP_PERCENT = 46;           // clamp off-screen blips to edge at 46%

/**
 * Player-Relative Radar
 * ---------------------
 * The current player is ALWAYS at center. Other entities are displayed
 * as offsets from the player's position, scaled by RADAR_VIEW_RADIUS.
 * Entities beyond the view radius are clamped to the radar edge.
 *
 * Coordinate chain:
 *   Server tile coords [0, WORLD_SIZE] → offset from player → percentage [0%, 100%]
 */
function tileOffsetToRadar(
  entityX: number, entityY: number,
  playerX: number, playerY: number
): { left: string; top: string; isOutOfRange: boolean } {
  const dx = entityX - playerX;
  const dy = entityY - playerY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  let pctX: number;
  let pctY: number;

  if (dist > RADAR_VIEW_RADIUS) {
    // Beyond view: clamp to edge of radar circle
    const angle = Math.atan2(dy, dx);
    pctX = 50 + Math.cos(angle) * EDGE_CLAMP_PERCENT;
    pctY = 50 + Math.sin(angle) * EDGE_CLAMP_PERCENT;
    return { left: `${pctX}%`, top: `${pctY}%`, isOutOfRange: true };
  }

  // Within view: scale to radar percentage
  pctX = 50 + (dx / RADAR_VIEW_RADIUS) * EDGE_CLAMP_PERCENT;
  pctY = 50 + (dy / RADAR_VIEW_RADIUS) * EDGE_CLAMP_PERCENT;

  return { left: `${pctX}%`, top: `${pctY}%`, isOutOfRange: false };
}

export function Radar({ playerTx, playerTy }: { playerTx: number; playerTy: number }) {
  const { players, demogorgonCoords, viewAs, proximityAlertActive, role } = useGameStore();
  const isDemo = (role ?? viewAs) === 'demogorgon';

  const radarColorSolid = isDemo ? '#ef4444' : '#06b6d4';
  const sweepGradient = isDemo
    ? 'conic-gradient(from 0deg, transparent 70%, rgba(239, 68, 68, 0.6) 100%)'
    : 'conic-gradient(from 0deg, transparent 70%, rgba(6, 182, 212, 0.6) 100%)';

  return (
    <div
      className="relative w-full max-w-lg aspect-square rounded-full overflow-hidden border-2 bg-void/90 flex items-center justify-center p-4 transition-colors duration-1000"
      style={{ borderColor: radarColorSolid }}
    >
      {/* Pulse effect if proximity alert */}
      {proximityAlertActive && !isDemo && (
        <motion.div
          className="absolute inset-0 rounded-full border-[4px] border-accent-red"
          animate={{ scale: [1, 1.05, 1], opacity: [0.3, 0.8, 0.3] }}
          transition={{ repeat: Infinity, duration: 1 }}
        />
      )}

      {/* Grid: Concentric Circles */}
      <div className="absolute inset-4 rounded-full border border-dashed opacity-30" style={{ borderColor: radarColorSolid }} />
      <div className="absolute inset-16 rounded-full border border-dashed opacity-30" style={{ borderColor: radarColorSolid }} />
      <div className="absolute inset-32 rounded-full border border-dashed opacity-30" style={{ borderColor: radarColorSolid }} />

      {/* Grid: Crosshairs */}
      <div className="absolute w-full h-[1px] opacity-30" style={{ backgroundColor: radarColorSolid }} />
      <div className="absolute h-full w-[1px] opacity-30" style={{ backgroundColor: radarColorSolid }} />

      {/* Sweeping Line */}
      <motion.div
        className="absolute w-full h-full rounded-full mix-blend-screen"
        style={{ background: sweepGradient }}
        animate={{ rotate: 360 }}
        transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
      >
        <div
          className="absolute top-0 left-1/2 w-[2px] h-1/2 origin-bottom transform -translate-x-1/2"
          style={{ backgroundColor: radarColorSolid, boxShadow: `0 0 10px ${radarColorSolid}` }}
        />
      </motion.div>

      {/* ── Player blips (relative to current player) ──────────────────── */}
      {players.map(player => {
        // Server sends tile coords directly — use player-relative transform
        const { left, top, isOutOfRange } = tileOffsetToRadar(
          player.x, player.y,
          playerTx, playerTy
        );

        // Use a stable blink duration derived from id
        const idHash = player.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
        const blinkDuration = 1.5 + (idHash % 10) * 0.15;

        // Status styling
        let dotColor = 'bg-accent-cyan';
        let dotSize = 'w-3 h-3';
        if (isDemo) {
          dotColor = 'bg-white';
        } else {
          if (player.status === 'danger') dotColor = 'bg-accent-red';
          if (player.status === 'caught') dotColor = 'bg-gray-600';
          if (player.status === 'unknown') dotColor = 'bg-yellow-500';
        }

        // Out-of-range blips are smaller and dimmer
        if (isOutOfRange) {
          dotSize = 'w-2 h-2';
        }

        // Skip caught players unless you're the demogorgon
        if (player.status === 'caught' && !isDemo) return null;

        return (
          <div
            key={player.id}
            className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-10"
            style={{ left, top }}
          >
            <motion.div
              className={clsx('rounded-full relative', dotColor, dotSize)}
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ repeat: Infinity, duration: blinkDuration }}
            >
              {!isOutOfRange && (
                <div className={clsx('absolute inset-0 rounded-full animate-ping opacity-75', dotColor)} />
              )}
            </motion.div>

            {!isOutOfRange && (
              <span className={clsx('text-xs mt-1 bg-void/80 px-1 rounded whitespace-nowrap', isDemo ? 'text-gray-400' : 'text-accent-cyan')}>
                {isDemo ? 'PREY' : (player.name ?? '???').slice(0, 6)}
              </span>
            )}
          </div>
        );
      })}

      {/* ── The Demogorgon (only visible for Security) ─────────────────── */}
      {!isDemo && (() => {
        const { left, top, isOutOfRange } = tileOffsetToRadar(
          demogorgonCoords.x, demogorgonCoords.y,
          playerTx, playerTy
        );

        return (
          <div
            className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-20"
            style={{ left, top }}
          >
            <motion.div
              className={clsx('rounded-full relative bg-accent-red', isOutOfRange ? 'w-2.5 h-2.5' : 'w-4 h-4')}
              animate={{ opacity: [0.7, 1, 0.7] }}
              transition={{ repeat: Infinity, duration: 0.8 }}
            >
              {!isOutOfRange && (
                <div className="absolute inset-0 rounded-full animate-ping opacity-90 bg-accent-red" />
              )}
            </motion.div>
            {!isOutOfRange && (
              <span className="text-xs font-bold mt-1 bg-void/80 px-1 rounded whitespace-nowrap text-glow-red text-accent-red">
                ANOMALY
              </span>
            )}
          </div>
        );
      })()}

      {/* ── Player Center Marker (YOU) ─────────────────────────────────── */}
      <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 z-30 flex flex-col items-center">
        <div
          className={clsx('w-3 h-3 rounded-full border-2', isDemo ? 'bg-accent-maroon border-red-500' : 'bg-accent-cyan border-cyan-300')}
          style={{ boxShadow: `0 0 8px ${radarColorSolid}` }}
        />
        <span className={clsx('text-[9px] font-bold mt-0.5 tracking-wider', isDemo ? 'text-accent-red' : 'text-accent-cyan')}>
          YOU
        </span>
      </div>
    </div>
  );
}

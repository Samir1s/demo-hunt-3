import { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GameCanvas } from '../canvas/GameCanvas';
import { DPadOverlay } from '../canvas/DPadOverlay';
import { useGameStore } from '../../store/gameStore';
import { usePlayerMovement } from '../../hooks/usePlayerMovement';
import type { Direction } from '../../hooks/usePlayerMovement';
import { useSocket } from '../../hooks/useSocket';
import { Radar } from '../radar/Radar';
import type { SpriteState } from '../canvas/GameCanvas';
import { clsx } from 'clsx';

/**
 * GameScreen — canvas world with HUD, real-time socket events, energy orbs,
 * proximity alerts, fog of war, and server-authoritative catch.
 */
export function GameScreen() {
  const {
    viewAs, players, demogorgonCoords, selectedAgent, agentCodename,
    addIntelEvent, role, proximityAlertActive,
    proximityIntensity, playerScore, remainingMs, isConnected
  } = useGameStore();
  const isDemo = (role ?? viewAs) === 'demogorgon';

  // Socket connection
  const { emitPosition, emitPositionLegacy, emitCatch, emitAccuse } = useSocket();

  // Sample real-time events
  useEffect(() => {
    const interval = setInterval(() => {
      addIntelEvent({
        timestamp: new Date().toLocaleTimeString(),
        message: isDemo 
          ? `Biomass detected at sector ${Math.floor(Math.random()*10)}...`
          : `Disturbance reported in sector ${Math.floor(Math.random()*10)}...`,
        type: isDemo ? 'warning' : 'system'
      });
    }, 8000);
    return () => clearInterval(interval);
  }, [addIntelEvent, isDemo]);

  const containerRef = useRef<HTMLDivElement>(null);

  // Player starts near center
  const { tx, ty, move } = usePlayerMovement({ initialTx: 20, initialTy: 20 });

  // Broadcast position on move — compute new pos THEN emit (fixes desync)
  const handleMove = (dir: Direction) => {
    // move() updates React state, but we need the NEW coords for emit
    // Calculate new position ourselves to avoid async state lag
    const dirMap: Record<Direction, [number, number]> = {
      up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
    };
    const [ddx, ddy] = dirMap[dir];
    const newX = Math.max(1, Math.min(38, tx + ddx));
    const newY = Math.max(1, Math.min(38, ty + ddy));
    move(dir);
    if (isConnected) {
      emitPosition(newX, newY);
    } else {
      emitPositionLegacy(newX, newY);
    }
  };

  // Build sprite list from store — identify demogorgon from player data
  // The server sends the demogorgon's position in the players array for fog-of-war
  const myId = useGameStore.getState().playerId;
  const demogorgonPlayer = players.find(p => p.isDemogorgon === true);

  // Update demogorgon coords in store when we detect the demogorgon player
  useEffect(() => {
    if (demogorgonPlayer) {
      useGameStore.getState().updateDemogorgonCoords({ x: demogorgonPlayer.x, y: demogorgonPlayer.y });
    }
  }, [demogorgonPlayer?.x, demogorgonPlayer?.y]);

  const sprites: SpriteState[] = players
    .filter(p => p.id !== myId) // don't render self, handled by playerTx/playerTy
    .map((p) => ({
      id: p.id,
      name: p.character ?? selectedAgent ?? 'hopper',
      tx: p.x,
      ty: p.y,
      isDemogorgon: !!p.isDemogorgon,
    }));

  // Measure container
  const w = containerRef.current?.clientWidth  || 640;
  const h = containerRef.current?.clientHeight || 480;

  // Distances for catch/accuse — all in tile units
  const distToDemo = Math.hypot(tx - demogorgonCoords.x, ty - demogorgonCoords.y);
  const activePlayers = players.filter(p => p.status !== 'caught');

  const agentDists = activePlayers.map(p => Math.hypot(tx - p.x, ty - p.y));
  const minAgentDist = agentDists.length ? Math.min(...agentDists) : Infinity;

  // Server handles catch validation + cooldown — client just shows visual hint
  const canCatch = isDemo && minAgentDist <= 2.0; // visual hint only, server decides
  const isDemoNear = !isDemo && (proximityAlertActive || distToDemo <= 3.0);

  // Haptic Feedback
  const [lastVibrated, setLastVibrated] = useState(0);
  useEffect(() => {
    if (isDemoNear) {
      const now = Date.now();
      if (now - lastVibrated > 2000) {
        if ('vibrate' in navigator) navigator.vibrate(200);
        setLastVibrated(now);
      }
    }
  }, [isDemoNear, lastVibrated]);

  // Timer from server snapshots
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = (totalSeconds % 60).toString().padStart(2, '0');

  const handleAction = () => {
    if (isDemo) {
      // Fix 2: Server-authoritative catch — just press CATCH, server finds nearest
      emitCatch(); // No targetId! Server auto-finds nearest within 1.5 tiles + 2s cooldown
    } else {
      // Target the NEAREST active player, not hardcoded [0]
      const sortedByDist = activePlayers
        .map(p => ({ ...p, dist: Math.hypot(tx - p.x, ty - p.y) }))
        .sort((a, b) => a.dist - b.dist);
      const closestAgent = sortedByDist[0];
      if (closestAgent) {
        emitAccuse(closestAgent.id);
      }
      addIntelEvent({
        timestamp: new Date().toLocaleTimeString(),
        message: '⚠ ACCUSATION FILED — awaiting confirmation.',
        type: 'warning',
      });
    }
  };

  return (
    <motion.div
      ref={containerRef}
      className="w-full h-full relative bg-black overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Proximity vignette overlay */}
      {proximityAlertActive && (
        <div 
          className="absolute inset-0 pointer-events-none z-30 transition-opacity duration-500"
          style={{
            background: `radial-gradient(ellipse at center, transparent 40%, rgba(239,68,68,${proximityIntensity * 0.4}) 100%)`,
          }}
        />
      )}

      {/* Canvas */}
      <div className="absolute inset-0 flex items-center justify-center">
        <GameCanvas
          playerTx={tx}
          playerTy={ty}
          playerAgent={selectedAgent ?? 'hopper'}
          isDemogorgon={isDemo}
          sprites={sprites}
          width={w || 640}
          height={h || 480}
        />
      </div>

      {/* Top Bar HUD */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-2 bg-black/80 border-b-2 border-accent-cyan/40 font-mono text-sm pointer-events-none z-40">
        <div className="flex items-center space-x-4">
          <span className={`px-2 py-0.5 rounded text-black font-bold tracking-widest ${isDemo ? 'bg-accent-red' : 'bg-accent-cyan'}`}>
            {isDemo ? 'DEMOGORGON' : 'SECURITY'}
          </span>
          <span className="text-white/70 tracking-widest hidden sm:inline-block">
            {isDemo ? 'HUNT MODE' : `AGENT: ${(agentCodename || selectedAgent || 'UNKNOWN').toUpperCase()}`}
          </span>
        </div>
        <div className="flex items-center space-x-6">
          {/* Score */}
          <span className="text-yellow-400 tracking-widest">
            ⚡ {playerScore}
          </span>
          <span className="text-green-400 tracking-widest">
            ALIVE: {activePlayers.length}
          </span>
          <span className={clsx(
            "tracking-widest text-lg font-bold",
            totalSeconds <= 60 ? "text-red-400 animate-pulse" : "text-yellow-400"
          )}>
            {mins}:{secs}
          </span>
          {/* Connection dot */}
          <span className={clsx("w-2 h-2 rounded-full", isConnected ? "bg-green-400" : "bg-yellow-500")} />
        </div>
      </div>

      {/* Alert Banner */}
      <AnimatePresence>
        {isDemoNear && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute top-14 left-0 right-0 flex justify-center pointer-events-none z-40"
          >
            <div className="bg-red-900/80 border-2 border-red-500 text-white font-bold font-mono tracking-widest px-6 py-2 rounded shadow-[0_0_20px_rgba(239,68,68,0.7)] animate-pulse">
              ⚠ DEMOGORGON NEAR — {(proximityIntensity * 100).toFixed(0)}% ⚠
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Keyboard hint */}
      <div className="absolute bottom-24 left-6 font-mono text-[10px] text-white/20 tracking-widest pointer-events-none">
        WASD / ARROWS + D-PAD TO MOVE
      </div>

      {/* Action Button */}
      <div className="absolute bottom-10 right-36 sm:right-44 z-50 select-none">
        <motion.button 
          className={clsx(
            "w-20 h-20 sm:w-24 sm:h-24 rounded-full border-4 font-bold text-lg sm:text-xl flex items-center justify-center transition-colors shadow-lg",
            isDemo 
              ? (canCatch ? 'bg-red-600 border-red-400 text-white shadow-[0_0_15px_rgba(239,68,68,0.8)]' : 'bg-red-900/50 border-red-900/50 text-red-500/50')
              : "border-cyan-400 bg-cyan-600/80 text-white shadow-[0_0_15px_rgba(6,182,212,0.6)]"
          )}
          onClick={handleAction}
          whileTap={isDemo && canCatch ? { scale: 0.9 } : {}}
          animate={isDemo && canCatch ? { scale: [1, 1.05, 1] } : {}}
          transition={isDemo && canCatch ? { repeat: Infinity, duration: 1 } : {}}
          disabled={isDemo && !canCatch}
        >
          {isDemo ? (canCatch ? 'CATCH' : 'NO TARGET') : 'ACCUSE'}
        </motion.button>
      </div>

      {/* Mini Radar */}
      <div className="absolute bottom-6 right-6 w-24 h-24 sm:w-32 sm:h-32 pointer-events-none opacity-80 z-40">
        <Radar playerTx={tx} playerTy={ty} />
      </div>

      {/* D-Pad */}
      <DPadOverlay onMove={handleMove} isDemogorgon={isDemo} />
    </motion.div>
  );
}

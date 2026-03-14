import { useGameStore } from '../../store/gameStore';
import { useSocket } from '../../hooks/useSocket';
import { Radar } from '../radar/Radar';
import { LogFeed } from '../radar/LogFeed';

import clsx from 'clsx';
import { motion } from 'framer-motion';

export function LobbyScreen() {
  const { viewAs, players, proximityAlertActive, isHost, isConnected, roomCode, playerScore, role, playerId, serverError } = useGameStore();
  const { emitStartCharacterSelect } = useSocket();

  const actualRole = role ?? viewAs;
  const isDemo = actualRole === 'demogorgon';

  const myPlayer = players.find(p => p.id === playerId);
  const playerTx = myPlayer?.x ?? 0;
  const playerTy = myPlayer?.y ?? 0;

  return (
    <div className={clsx(
      "w-full h-full p-4 md:p-8 flex flex-col transition-colors duration-1000",
      isDemo ? "bg-void text-accent-maroon" : "bg-void text-accent-cyan"
    )}>
      {/* Header */}
      <header className="flex justify-between items-center mb-8 border-b pb-4" style={{ borderColor: isDemo ? 'rgba(127,29,29,0.5)' : 'rgba(6,182,212,0.3)' }}>
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-display tracking-widest">
            {isDemo ? 'HIVE MIND NEURAL LINK' : 'HAWKINS LAB SECUR/OS v4.2'}
          </h1>
          {/* Server Error Alert */}
          {serverError && (
            <div className="bg-red-900 border border-red-500 text-white px-4 py-1 rounded animate-pulse font-mono text-[10px] tracking-widest uppercase">
              ⚠ Error: {serverError}
            </div>
          )}
          {/* Connection indicator */}
          <div className={clsx(
            "flex items-center gap-2 font-mono text-xs tracking-widest",
            isConnected ? "text-green-400" : "text-yellow-500"
          )}>
            <span className={clsx("w-2 h-2 rounded-full", isConnected ? "bg-green-400 animate-pulse" : "bg-yellow-500")} />
            {isConnected ? 'ONLINE' : 'OFFLINE'}
          </div>
        </div>
        <div className="text-sm font-mono flex items-center gap-4">
          {roomCode && (
            <span className="text-white/30 tracking-widest text-xs">
              ROOM: {roomCode}
            </span>
          )}
          <span className={clsx("animate-pulse", proximityAlertActive ? "text-accent-red" : "")}>
            STATUS: {proximityAlertActive ? 'CRITICAL PROXIMITY' : 'NOMINAL'}
          </span>
          <div className="flex gap-2 items-center">
            <span>VIEW:</span>
            <span className={clsx("px-2 py-1 rounded font-bold border", isDemo ? "border-accent-maroon text-accent-red" : "border-accent-cyan text-accent-cyan")}>
              {isDemo ? 'PREDATOR' : 'SECURITY'}
            </span>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-8 overflow-hidden">
        
        {/* Left Col: Roster */}
        <div className="col-span-1 border p-4 flex flex-col overflow-hidden" style={{ borderColor: isDemo ? 'rgba(127,29,29,0.3)' : 'rgba(6,182,212,0.3)' }}>
          <h2 className="mb-4 uppercase tracking-widest border-b pb-2" style={{ borderColor: isDemo ? 'rgba(127,29,29,0.5)' : 'rgba(6,182,212,0.3)' }}>
            {isDemo ? 'AVAILABLE BIOMASS' : 'PERSONNEL TRACKING'}
          </h2>
          <div className="flex-1 overflow-y-auto space-y-4 font-mono text-sm">
            {players.filter(p => !isDemo || p.name !== 'Unknown Entity').map(player => (
              <div key={player.id} className="flex justify-between items-center p-2 rounded" style={{ backgroundColor: isDemo ? 'rgba(127,29,29,0.1)' : 'rgba(6,182,212,0.05)' }}>
                <div className="flex items-center gap-2">
                  <span>{player.name}</span>
                  {player.isHost && (
                    <span className="text-[10px] text-yellow-400/80 font-bold">👑</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {player.character && (
                    <span className="text-[10px] text-white/30 uppercase tracking-wider">
                      {player.character}
                    </span>
                  )}
                  <span className={clsx(
                    "text-xs px-2 py-1 rounded border",
                    player.status === 'safe' && !isDemo ? 'border-accent-cyan text-accent-cyan' :
                    player.status === 'danger' || isDemo ? 'border-accent-red text-accent-red animate-pulse' :
                    'border-yellow-500 text-yellow-500'
                  )}>
                    {isDemo ? 'TARGET' : player.status.toUpperCase()}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Score display */}
          {playerScore > 0 && (
            <div className="mt-3 flex items-center justify-between font-mono text-xs border-t pt-2" style={{ borderColor: 'rgba(6,182,212,0.2)' }}>
              <span className="text-white/40 tracking-widest">ENERGY COLLECTED</span>
              <span className="text-yellow-400 font-bold text-lg">{playerScore}</span>
            </div>
          )}

          {/* Action Button */}
          <motion.button 
            className={clsx(
              "mt-4 p-4 font-display text-xl uppercase tracking-wider border-2 transition-all",
              isDemo ? "border-accent-red bg-accent-red/20 text-white hover:bg-accent-red/40" 
                     : "border-accent-cyan bg-accent-cyan/20 text-white hover:bg-accent-cyan/40",
              (!isHost || players.length < 2) && "opacity-50 cursor-not-allowed"
            )}
            disabled={!isHost || players.length < 2}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => {
              if (isHost) {
                emitStartCharacterSelect();
              }
            }}
            whileHover={isHost && players.length >= 2 ? { scale: 1.02 } : {}}
            whileTap={isHost && players.length >= 2 ? { scale: 0.98 } : {}}
          >
            {isHost
              ? (players.length < 2 ? 'WAITING FOR PLAYERS...' : 'INITIATE SELECTION →')
              : 'WAITING FOR HOST...'
            }
          </motion.button>
        </div>

        {/* Center Col: Radar */}
        <div className="col-span-1 md:col-span-1 flex items-center justify-center">
          <Radar playerTx={playerTx} playerTy={playerTy} />
        </div>

        {/* Right Col: Intel Feed */}
        <div className="col-span-1 h-full">
          <LogFeed />
        </div>

      </div>
    </div>
  );
}

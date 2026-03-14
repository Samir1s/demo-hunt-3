import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Typewriter } from '../ui/Typewriter';
import { useGameStore } from '../../store/gameStore';

// Auto-detect server URL for LAN/mobile support
function getServerUrl(): string {
  if (import.meta.env.VITE_SERVER_URL) {
    return import.meta.env.VITE_SERVER_URL;
  }
  const hostname = window.location.hostname || 'localhost';
  return `http://${hostname}:3001`;
}

export function LandingScreen() {
  const { setScreen, setCodename, agentCodename, setRoomCode, setPlayerId } = useGameStore();
  const [accessCode, setAccessCode] = useState('');
  const [introComplete, setIntroComplete] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'idle' | 'create' | 'join'>('idle');
  const [generatedCode, setGeneratedCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  // ── CREATE Room ──────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!agentCodename.trim()) {
      setError('AGENT CODENAME REQUIRED');
      return;
    }
    setError('');
    setIsCreating(true);

    try {
      const res = await fetch(`${getServerUrl()}/api/create-room`, { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'ROOM CREATION FAILED');
        setIsCreating(false);
        return;
      }

      setGeneratedCode(data.code);
      setMode('create');
      setIsCreating(false);

      // Set store values
      setRoomCode(data.code);
      const playerId = `agent_${agentCodename.trim().toLowerCase()}_${Date.now().toString(36)}`;
      setPlayerId(playerId);
    } catch {
      setError('SERVER UNREACHABLE — check connection');
      setIsCreating(false);
    }
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(generatedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text
    }
  };

  const handleEnterCreatedRoom = () => {
    setScreen('character-select');
  };

  // ── JOIN Room ────────────────────────────────────────────────────────────
  const handleJoin = async () => {
    if (!agentCodename.trim()) {
      setError('AGENT CODENAME REQUIRED');
      return;
    }
    if (!accessCode.trim()) {
      setError('ROOM CODE REQUIRED');
      return;
    }
    setError('');

    const code = accessCode.trim().toUpperCase();

    try {
      const res = await fetch(`${getServerUrl()}/api/room/${code}`);
      const data = await res.json();

      if (!data.exists) {
        setError('ROOM NOT FOUND — check code');
        return;
      }

      setRoomCode(code);
      const playerId = `agent_${agentCodename.trim().toLowerCase()}_${Date.now().toString(36)}`;
      setPlayerId(playerId);
      setScreen('character-select');
    } catch {
      // If server unreachable, try connecting anyway (getOrCreateRoom fallback)
      setRoomCode(code);
      const playerId = `agent_${agentCodename.trim().toLowerCase()}_${Date.now().toString(36)}`;
      setPlayerId(playerId);
      setScreen('character-select');
    }
  };

  return (
    <motion.div
      className="w-full h-full flex flex-col items-center justify-center bg-void relative overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
    >
      {/* Grid background */}
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: 'linear-gradient(rgba(6,182,212,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.5) 1px, transparent 1px)',
        backgroundSize: '40px 40px'
      }} />

      {/* Uplink status */}
      <div className="absolute top-6 right-8 flex items-center gap-2 font-mono text-xs text-accent-cyan">
        <span className="w-2 h-2 rounded-full bg-accent-cyan animate-pulse" />
        UPLINK ACTIVE
      </div>

      {/* Lab header */}
      <div className="absolute top-8 left-8">
        <div className="font-display text-xs tracking-[0.4em] text-accent-cyan/40 uppercase">
          U.S. Dept. of Energy
        </div>
        <div className="font-display text-sm tracking-[0.3em] text-accent-cyan/60 uppercase">
          Hawkins National Laboratory
        </div>
      </div>

      {/* Main content */}
      <div className="relative z-10 w-full max-w-lg px-8 flex flex-col gap-8">
        {/* Header */}
        <div className="text-center">
          <div className="font-terminal text-accent-cyan text-sm mb-3 tracking-widest">
            {introComplete ? (
              <span>CLEARANCE REQUIRED — IDENTIFY YOURSELF</span>
            ) : (
              <Typewriter
                text="HAWKINS NATIONAL LABORATORY — CLEARANCE REQUIRED"
                speed={35}
                onComplete={() => setIntroComplete(true)}
              />
            )}
          </div>
          <motion.h1
            className="font-display text-4xl md:text-5xl text-white tracking-wider"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: introComplete ? 1 : 0, y: introComplete ? 0 : 10 }}
            transition={{ duration: 0.8 }}
          >
            ENTER THE LAB
          </motion.h1>
        </div>

        {/* Input + Actions */}
        <motion.div
          className="flex flex-col gap-5"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: introComplete ? 1 : 0, y: introComplete ? 0 : 20 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          {/* Codename (always visible) */}
          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs tracking-widest text-accent-cyan/70 uppercase">
              Agent Codename
            </label>
            <input
              type="text"
              value={agentCodename}
              onChange={(e) => setCodename(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              placeholder="e.g. ELEVEN / HOPPER"
              className="bg-transparent border border-accent-cyan/50 text-accent-cyan font-mono text-sm px-4 py-3 rounded focus:outline-none focus:border-accent-cyan placeholder-accent-cyan/20 transition-colors"
            />
          </div>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.p
                className="font-mono text-xs text-accent-red animate-pulse tracking-widest"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                ⚠ {error}
              </motion.p>
            )}
          </AnimatePresence>

          {/* ── Mode: Idle → show CREATE / JOIN buttons ─────────────────── */}
          {mode === 'idle' && (
            <div className="flex gap-4">
              <motion.button
                onClick={handleCreate}
                disabled={isCreating}
                className="flex-1 py-4 font-display text-sm tracking-widest uppercase text-void bg-accent-cyan border-2 border-accent-cyan hover:bg-transparent hover:text-accent-cyan transition-all duration-300 rounded disabled:opacity-50"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                style={{ boxShadow: '0 0 30px rgba(6,182,212,0.4)' }}
              >
                {isCreating ? 'CREATING...' : 'CREATE ROOM'}
              </motion.button>

              <motion.button
                onClick={() => setMode('join')}
                className="flex-1 py-4 font-display text-sm tracking-widest uppercase text-accent-cyan bg-transparent border-2 border-accent-cyan/50 hover:border-accent-cyan hover:bg-accent-cyan/10 transition-all duration-300 rounded"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                JOIN ROOM
              </motion.button>
            </div>
          )}

          {/* ── Mode: Created → show room code to share ────────────────── */}
          <AnimatePresence>
            {mode === 'create' && generatedCode && (
              <motion.div
                className="flex flex-col gap-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <div className="border border-accent-cyan/40 rounded p-5 text-center bg-accent-cyan/5">
                  <div className="font-mono text-xs text-accent-cyan/60 tracking-widest mb-2">
                    ROOM CODE — SHARE WITH AGENTS
                  </div>
                  <div
                    className="font-display text-4xl text-accent-cyan tracking-[0.5em] cursor-pointer"
                    onClick={handleCopyCode}
                    style={{ textShadow: '0 0 20px rgba(6,182,212,0.5)' }}
                  >
                    {generatedCode}
                  </div>
                  <motion.div
                    className="font-mono text-xs text-accent-cyan/50 mt-2 tracking-widest"
                    animate={{ opacity: copied ? 1 : 0.5 }}
                  >
                    {copied ? '✓ COPIED TO CLIPBOARD' : 'CLICK CODE TO COPY'}
                  </motion.div>
                </div>

                <motion.button
                  onClick={handleEnterCreatedRoom}
                  className="w-full py-4 font-display text-lg tracking-widest uppercase text-void bg-accent-cyan border-2 border-accent-cyan hover:bg-transparent hover:text-accent-cyan transition-all duration-300 rounded"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  style={{ boxShadow: '0 0 30px rgba(6,182,212,0.4)' }}
                >
                  Enter Room →
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Mode: Join → show room code input ──────────────────────── */}
          <AnimatePresence>
            {mode === 'join' && (
              <motion.div
                className="flex flex-col gap-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <div className="flex flex-col gap-1">
                  <label className="font-mono text-xs tracking-widest text-accent-cyan/70 uppercase">
                    Room Code
                  </label>
                  <input
                    type="text"
                    value={accessCode}
                    onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                    placeholder="Enter 6-character code"
                    maxLength={8}
                    className="bg-transparent border border-accent-cyan/50 text-accent-cyan font-mono text-lg px-4 py-3 rounded focus:outline-none focus:border-accent-cyan placeholder-accent-cyan/20 transition-colors tracking-[0.3em] text-center"
                    autoFocus
                  />
                </div>

                <div className="flex gap-3">
                  <motion.button
                    onClick={() => setMode('idle')}
                    className="px-6 py-3 font-display text-sm tracking-widest uppercase text-accent-cyan/50 border border-accent-cyan/20 hover:border-accent-cyan/50 transition-all rounded"
                    whileTap={{ scale: 0.97 }}
                  >
                    ← Back
                  </motion.button>
                  <motion.button
                    onClick={handleJoin}
                    className="flex-1 py-3 font-display text-sm tracking-widest uppercase text-void bg-accent-cyan border-2 border-accent-cyan hover:bg-transparent hover:text-accent-cyan transition-all duration-300 rounded"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    style={{ boxShadow: '0 0 20px rgba(6,182,212,0.3)' }}
                  >
                    Join Room →
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Bottom classification */}
      <div className="absolute bottom-6 left-0 right-0 text-center font-mono text-[10px] text-accent-cyan/20 tracking-widest">
        TOP SECRET // COMPARTMENTED — UNAUTHORIZED ACCESS PROSECUTED UNDER 18 U.S.C. § 1030
      </div>
    </motion.div>
  );
}

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../../store/gameStore';
import { GlitchText } from '../ui/GlitchText';
import { useSocket } from '../../hooks/useSocket';

const AUTO_ADVANCE_MS = 5000;

// iOS 13+ requires explicit user gesture to enable DeviceMotion
const needsMotionPermission = typeof (DeviceMotionEvent as any)?.requestPermission === 'function';

export function RoleRevealScreen() {
  const { role, viewAs, setScreen, agentCodename, selectedAgent, secretObjective, isHost } = useGameStore();
  const { emitStartGame } = useSocket();

  // iOS DeviceMotion permission state
  const [motionGranted, setMotionGranted] = useState<'prompt' | 'granted' | 'denied'>('prompt');

  const handleMotionPermission = async () => {
    try {
      const result = await (DeviceMotionEvent as any).requestPermission();
      setMotionGranted(result === 'granted' ? 'granted' : 'denied');
    } catch {
      setMotionGranted('denied');
    }
  };

  // Use server-assigned role if available, fallback to viewAs
  const actualRole = role ?? viewAs;
  const isDemo = actualRole === 'demogorgon';

  const SECURITY_OBJECTIVE = secretObjective || "Monitor radar signatures and coordinate agent movements. Identify and accuse the Demogorgon before it catches all agents.";
  const DEMOGORGON_OBJECTIVE = secretObjective || "Hunt. Feed. Consume. Eliminate all agents before they identify you. You are the apex predator of the Upside Down.";

  // Auto-advance: host starts game, non-host waits
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isHost) {
        emitStartGame();
      }
      // setScreen('game') will be triggered by the 'gameStarted' socket event
      // Fallback for offline mode:
      setScreen('lobby');
    }, AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [setScreen, isHost, emitStartGame]);

  return (
    <motion.div
      className="w-full h-full flex flex-col items-center justify-center relative overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Flash-to-black CRT slam entrance */}
      <motion.div
        className="absolute inset-0 bg-white z-50 pointer-events-none"
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.15, ease: 'easeIn' }}
      />

      {/* Role-colored background radial pulse */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: isDemo
            ? 'radial-gradient(ellipse at center, rgba(192,57,43,0.25) 0%, rgba(127,29,29,0.05) 50%, transparent 80%)'
            : 'radial-gradient(ellipse at center, rgba(6,182,212,0.2) 0%, rgba(30,58,138,0.05) 50%, transparent 80%)',
        }}
        animate={{ opacity: [0.5, 1, 0.6, 1] }}
        transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
      />

      {/* Pulsing ring */}
      <motion.div
        className="absolute rounded-full border-2 pointer-events-none"
        style={{ borderColor: isDemo ? 'rgba(192,57,43,0.4)' : 'rgba(6,182,212,0.4)' }}
        animate={{ width: [120, 500], height: [120, 500], opacity: [0.8, 0] }}
        transition={{ repeat: Infinity, duration: 2.5, ease: 'easeOut' }}
      />
      <motion.div
        className="absolute rounded-full border-2 pointer-events-none"
        style={{ borderColor: isDemo ? 'rgba(192,57,43,0.3)' : 'rgba(6,182,212,0.3)' }}
        animate={{ width: [120, 600], height: [120, 600], opacity: [0.6, 0] }}
        transition={{ repeat: Infinity, duration: 2.5, delay: 0.8, ease: 'easeOut' }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-6 text-center px-8 max-w-xl">

        {/* Role badge */}
        <motion.div
          className="font-mono text-[10px] tracking-[0.5em] px-4 py-1 border rounded-full"
          style={{
            borderColor: isDemo ? '#ef4444' : '#06b6d4',
            color: isDemo ? '#ef4444' : '#06b6d4',
            backgroundColor: isDemo ? 'rgba(239,68,68,0.1)' : 'rgba(6,182,212,0.1)',
          }}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
        >
          {isDemo ? '🔴 CLASSIFIED' : '🔵 CLEARANCE GRANTED'}
        </motion.div>

        {/* Agent welcome */}
        <motion.div
          className="font-mono text-xs tracking-[0.5em]"
          style={{ color: isDemo ? 'rgba(239,68,68,0.6)' : 'rgba(6,182,212,0.6)' }}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          {agentCodename ? `WELCOME, AGENT ${agentCodename.toUpperCase()}` : `AGENT ${selectedAgent?.toUpperCase() ?? 'UNKNOWN'} — ROLE ASSIGNED`}
        </motion.div>

        {/* Role title */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.6, duration: 0.5, ease: 'backOut' }}
        >
          {isDemo ? (
            <GlitchText
              text="YOU ARE THE DEMOGORGON"
              glitchIntensity="high"
              className="font-display text-4xl md:text-5xl text-white text-glow-red"
            />
          ) : (
            <motion.h1
              className="font-display text-4xl md:text-5xl text-white text-glow-cyan"
              style={{ filter: 'blur(8px)' }}
              animate={{ filter: 'blur(0px)' }}
              transition={{ delay: 0.8, duration: 0.8 }}
            >
              YOU ARE SECURITY
            </motion.h1>
          )}
        </motion.div>

        {/* Role icon */}
        <motion.div
          className="text-6xl"
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.9, type: 'spring', stiffness: 200 }}
        >
          {isDemo ? '🦷' : '🔵'}
        </motion.div>

        {/* Objective card */}
        <motion.div
          className="border rounded p-5 text-left"
          style={{
            borderColor: isDemo ? 'rgba(192,57,43,0.5)' : 'rgba(6,182,212,0.4)',
            backgroundColor: isDemo ? 'rgba(127,29,29,0.15)' : 'rgba(6,182,212,0.08)',
          }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.1, duration: 0.5 }}
        >
          <div
            className="font-display text-xs tracking-widest mb-2 uppercase"
            style={{ color: isDemo ? '#ef4444' : '#06b6d4' }}
          >
            Your Objective
          </div>
          <p className="font-mono text-sm text-white/70 leading-relaxed">
            {isDemo ? DEMOGORGON_OBJECTIVE : SECURITY_OBJECTIVE}
          </p>
        </motion.div>

        {/* iOS DeviceMotion permission request (Fix 5) */}
        {needsMotionPermission && motionGranted === 'prompt' && (
          <motion.button
            onClick={handleMotionPermission}
            className="w-full py-3 font-mono text-xs tracking-widest uppercase rounded border-2 transition-all"
            style={{
              borderColor: isDemo ? 'rgba(192,57,43,0.6)' : 'rgba(6,182,212,0.6)',
              color: isDemo ? '#ef4444' : '#06b6d4',
              backgroundColor: isDemo ? 'rgba(127,29,29,0.2)' : 'rgba(6,182,212,0.1)',
            }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.3 }}
            whileTap={{ scale: 0.97 }}
          >
            📱 Grant Motion Access (Required on iOS)
          </motion.button>
        )}

        {needsMotionPermission && motionGranted !== 'prompt' && (
          <motion.div
            className="font-mono text-[10px] tracking-widest w-full text-center"
            style={{ color: motionGranted === 'granted' ? '#10b981' : '#ef4444' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {motionGranted === 'granted' ? '✓ MOTION ACCESS GRANTED' : '✕ MOTION ACCESS DENIED — Movement may be limited'}
          </motion.div>
        )}

        {/* Auto-advance countdown bar */}
        <div className="w-full">
          <div className="font-mono text-[10px] text-white/30 tracking-widest mb-1 text-right">
            {isHost ? 'AUTO-STARTING GAME...' : 'WAITING FOR HOST TO START...'}
          </div>
          <div className="h-px w-full bg-white/10 rounded overflow-hidden">
            <motion.div
              className="h-full rounded"
              style={{ backgroundColor: isDemo ? '#ef4444' : '#06b6d4' }}
              initial={{ width: '100%' }}
              animate={{ width: '0%' }}
              transition={{ duration: AUTO_ADVANCE_MS / 1000, ease: 'linear' }}
            />
          </div>
        </div>

        {/* Skip button */}
        <motion.button
          onClick={() => {
            if (isHost) emitStartGame();
            setScreen('lobby');
          }}
          className="font-mono text-xs tracking-widest text-white/30 hover:text-white/60 transition-colors"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
        >
          {isHost ? 'Skip → Start Game' : 'Skip → Enter Lobby'}
        </motion.button>
      </div>
    </motion.div>
  );
}

import { AnimatePresence } from 'framer-motion';
import { CRTOverlay } from './components/ui/CRTOverlay';
import { BootSequence } from './components/ui/BootSequence';
import { LandingScreen } from './components/screens/LandingScreen';
import { CharacterSelectScreen } from './components/screens/CharacterSelectScreen';
import { RoleRevealScreen } from './components/screens/RoleRevealScreen';
import { LobbyScreen } from './components/screens/LobbyScreen';
import { HeroScreen } from './components/screens/HeroScreen';
import { GameScreen } from './components/screens/GameScreen';
import { GameOverScreen } from './components/screens/GameOverScreen';
import { ProximityAlertScreen } from './components/screens/ProximityAlertScreen';
import { ViewToggle } from './components/controls/ViewToggle';
import { DemoPanel } from './components/controls/DemoPanel';
import { useGameStore } from './store/gameStore';
import { useGameSimulation } from './hooks/useGameSimulation';
import { useSocket } from './hooks/useSocket';

function App() {
  const currentScreen = useGameStore(state => state.screen);

  useGameSimulation();

  // Initialize socket connection — auto-connects when roomCode + playerId are set
  useSocket();

  return (
    <div className="w-screen h-screen bg-void text-white overflow-hidden relative selection:bg-accent-cyan/30">

      <CRTOverlay>
        <AnimatePresence mode="wait">
          {currentScreen === 'boot'            && <BootSequence          key="boot"     />}
          {currentScreen === 'landing'          && <LandingScreen         key="landing"  />}
          {currentScreen === 'character-select' && <CharacterSelectScreen key="char-sel" />}
          {currentScreen === 'reveal'           && <RoleRevealScreen      key="reveal"   />}
          {currentScreen === 'lobby'            && <LobbyScreen           key="lobby"    />}
          {currentScreen === 'hero'             && <HeroScreen            key="hero"     />}
          {currentScreen === 'game'             && <GameScreen            key="game"     />}
          {currentScreen === 'gameover'          && <GameOverScreen        key="gameover" />}
        </AnimatePresence>
      </CRTOverlay>

      <AnimatePresence>
        {currentScreen === 'alert' && <ProximityAlertScreen key="alert" />}
      </AnimatePresence>

      {currentScreen !== 'boot' && (
        <>
          <ViewToggle />
          <DemoPanel />
        </>
      )}
    </div>
  );
}

export default App;

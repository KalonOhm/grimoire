import { useEffect, useRef, useState } from 'react';
import * as Phaser from 'phaser';
import { GameScene } from './phaser/GameScene';
import { GameUI } from './components/GameUI';
import { gameEngine } from './game/engine';
import { eventBus } from './game/events';
import { loadAllData } from './game/loader';
import { mapRegistry } from './game/registry';
import './App.css';

export function App() {
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<GameScene | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const initGame = async () => {
      try {
        console.log('[App] Starting data load...');
        
        const result = await loadAllData();
        
        console.log('[App] Data load result:', result);

        if (!result.success) {
          console.error('[App] Data load failed:', result.errors);
          setError(result.errors.join('\n'));
          return;
        }

        const mapData = mapRegistry.get('skirmish_1');
        console.log('[App] Map data retrieved:', mapData ? `found (${mapData.width}x${mapData.height})` : 'null');
        
        if (!mapData) {
          setError('Could not find skirmish_1 map');
          return;
        }

        console.log('[App] Initializing game engine...');
        gameEngine.initialize(mapData);
        
        const state = gameEngine.getState();
        console.log('[App] Game state initialized:', state ? `phase=${state.phase}, units=${state.units.size}` : 'null');

        setLoading(false);
        console.log('[App] Loading complete, loading=false');
      } catch (err) {
        console.error('[App] Initialization error:', err);
        setError(`Failed to initialize: ${err}`);
      }
    };

    initGame();
  }, []);

  useEffect(() => {
    if (loading || error || started) return;

    console.log('[App] Creating Phaser game...');

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: 'game-container',
      width: '100%',
      height: '100%',
      backgroundColor: '#1a1a2e',
      scene: [GameScene],
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      input: {
        keyboard: true,
        mouse: true,
      },
    };

    gameRef.current = new Phaser.Game(config);
    console.log('[App] Phaser game created');

    // Listen for scene ready event instead of trying to get scene immediately
    const unsubscribeSceneReady = eventBus.on('SCENE_READY', () => {
      console.log('[App] SCENE_READY event received');
      
      // Now we can safely get the scene
      const scene = gameRef.current?.scene.getScene('GameScene') as GameScene | undefined;
      console.log('[App] Scene retrieved:', scene ? 'found' : 'null');
      
      if (scene) {
        sceneRef.current = scene;
        const state = gameEngine.getState();
        console.log('[App] Calling scene.updateState...');
        if (state) {
          scene.updateState(state);
          console.log('[App] scene.updateState called successfully');
        }
      }
    });

    // Periodic sync as backup
    const unsubscribe = setInterval(() => {
      const state = gameEngine.getState();
      if (sceneRef.current && state) {
        sceneRef.current.updateState(state);
      }
    }, 100);

    setStarted(true);
    console.log('[App] started=true');

    return () => {
      unsubscribeSceneReady();
      clearInterval(unsubscribe);
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, [loading, error, started]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <h1>GrimWars: Dark Future</h1>
          <div className="loading-spinner"></div>
          <p>Loading game data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-screen">
        <div className="error-content">
          <h1>Error</h1>
          <pre>{error}</pre>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="game-container">
      <div id="game-container" className="phaser-container"></div>
      <GameUI />
    </div>
  );
}

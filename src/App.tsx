import { useEffect, useRef, useState } from 'react';
import * as Phaser from 'phaser';
import { GameScene } from './phaser/GameScene';
import { GameUI } from './components/GameUI';
import { gameEngine } from './game/engine';
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
        const result = await loadAllData();

        if (!result.success) {
          setError(result.errors.join('\n'));
          return;
        }

        const mapData = mapRegistry.get('skirmish_1');
        if (!mapData) {
          setError('Could not find skirmish_1 map');
          return;
        }

        gameEngine.initialize(mapData);

        setLoading(false);
      } catch (err) {
        setError(`Failed to initialize: ${err}`);
      }
    };

    initGame();
  }, []);

  useEffect(() => {
    if (loading || error || started) return;

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

    const scene = gameRef.current.scene.getScene('GameScene') as GameScene;
    if (scene) {
      sceneRef.current = scene;
      const state = gameEngine.getState();
      if (state) {
        scene.updateState(state);
      }
    }

    const unsubscribe = setInterval(() => {
      const state = gameEngine.getState();
      if (sceneRef.current && state) {
        sceneRef.current.updateState(state);
      }
    }, 100);

    setStarted(true);

    return () => {
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

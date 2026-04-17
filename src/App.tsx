import { useEffect, useState, useCallback } from 'react';
import { GameState, Position } from './game/types';
import { GameBoard } from './components/GameBoard';
import { HoverInfoPanel } from './components/HoverInfoPanel';
import { CombatPreviewPanel } from './components/CombatPreviewPanel';
import { gameEngine } from './game/engine';
import { eventBus } from './game/events';
import { loadAllData } from './game/loader';
import { mapRegistry } from './game/registry';
import './App.css';

export function App() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredTile, setHoveredTile] = useState<Position | null>(null);

  const refreshState = useCallback(() => {
    const state = gameEngine.getState();
    if (state) {
      setGameState({ ...state });
    }
  }, []);

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
        
        setGameState(state);

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
    if (!gameState) return;

    const events = [
      'PHASE_CHANGE',
      'UNIT_SELECTED',
      'UNIT_DESELECTED',
      'MOVE_PREVIEW_SHOWN',
      'MOVE_PREVIEW_HIDDEN',
      'ATTACK_PREVIEW_SHOWN',
      'ATTACK_PREVIEW_HIDDEN',
      'UNIT_MOVED',
      'UNIT_ATTACKED',
      'UNIT_DESTROYED',
      'TURN_START',
      'GAME_OVER',
      'BUILDING_SELECTED',
      'BUILDING_DESELECTED',
    ];

    const unsubscribes = events.map(eventName => 
      eventBus.on(eventName, () => {
        console.log('[App] Event received:', eventName);
        refreshState();
      })
    );

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [gameState, refreshState]);

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

  if (!gameState) {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <p>Initializing...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="game-container">
      <div className="top-bar">
        <div className="turn-info">
          <span className="turn-label">Turn {gameEngine.getState()?.currentTurn || 1}</span>
          <span className={`player-indicator player-${gameEngine.getState()?.activePlayer || 1}`}>
            Player {gameEngine.getState()?.activePlayer || 1}'s Turn
          </span>
        </div>
        <div className="credits">
          Credits: {(gameEngine.getState()?.players[gameEngine.getState()?.activePlayer || 1]?.credits || 0).toLocaleString()}
        </div>
      </div>
      <div className="game-board-wrapper">
          <GameBoard 
            state={gameState} 
            onStateChange={refreshState}
            onTileHover={setHoveredTile}
            onTileLeave={() => setHoveredTile(null)}
          />
      </div>
      <div className="bottom-bar">
        <div className="phase-indicator">
          Phase: {gameEngine.getState()?.phase || 'IDLE'}
        </div>
        <button className="end-turn-btn" onClick={() => gameEngine.endTurn()}>
          End Turn
        </button>
      </div>
      <HoverInfoPanel state={gameState} hoveredTile={hoveredTile} />
      <CombatPreviewPanel state={gameState} hoveredTile={hoveredTile} />
    </div>
  );
}

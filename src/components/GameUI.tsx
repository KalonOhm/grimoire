import React from 'react';
import { usePhase, useActivePlayer, useCurrentTurn, useCredits, useWinner } from './useGameEvent';
import { gameEngine } from '../game/engine';
import './GameUI.css';

export function GameUI() {
  const phase = usePhase();
  const activePlayer = useActivePlayer();
  const currentTurn = useCurrentTurn();
  const credits = useCredits(activePlayer);
  const winner = useWinner();

  const handleEndTurn = () => {
    gameEngine.endTurn();
  };

  const handleCancel = () => {
    const state = gameEngine.getState();
    if (!state) return;
    
    // Deselect based on current phase
    if (state.selectedUnitId) {
      gameEngine.deselectUnit();
    } else if (state.selectedBuildingId) {
      gameEngine.deselectBuilding();
    }
  };

  return (
    <div className="game-ui">
      <div className="top-bar">
        <div className="turn-info">
          <span className="turn-label">Turn {currentTurn}</span>
          <span className={`player-indicator player-${activePlayer}`}>
            Player {activePlayer}'s Turn
          </span>
        </div>
        <div className="credits">
          Credits: {credits.toLocaleString()}
        </div>
      </div>

      <div className="bottom-bar">
        <div className="phase-indicator">
          Phase: {phase.replace(/_/g, ' ')}
        </div>
<div className="controls">
            <button 
              className="cancel-btn" 
              onClick={handleCancel}
              disabled={phase === 'IDLE' || phase === 'GAME_OVER'}
              style={{ marginRight: '8px' }}
            >
              Cancel
            </button>
            <button 
              className="end-turn-btn" 
              onClick={handleEndTurn}
              disabled={phase === 'GAME_OVER'}
            >
              End Turn
            </button>
          </div>
      </div>

      {winner && (
        <div className="game-over-overlay">
          <div className="game-over-modal">
            <h1 className={`winner-text player-${winner}`}>
              Player {winner} Wins!
            </h1>
            <button onClick={() => window.location.reload()}>
              Play Again
            </button>
          </div>
        </div>
      )}

      <div className="controls-help">
        <h4>Controls</h4>
        <ul>
          <li><kbd>Click</kbd> - Select unit / building / action</li>
        </ul>
      </div>
    </div>
  );
}

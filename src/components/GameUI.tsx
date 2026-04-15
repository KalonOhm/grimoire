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
          <li><kbd>ESC</kbd> - Cancel / Deselect</li>
          <li><kbd>Space</kbd> - End unit turn (wait)</li>
          <li><kbd>Enter</kbd> - End turn</li>
        </ul>
      </div>
    </div>
  );
}

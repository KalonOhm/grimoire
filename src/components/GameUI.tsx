import React from 'react';
import { usePhase, useActivePlayer, useCurrentTurn, useCredits, useWinner, useGameEvent } from './useGameEvent';
import { gameEngine } from '../game/engine';
import { unitRegistry } from '../game/registry';
import './GameUI.css';

export function GameUI() {
  const phase = usePhase();
  const activePlayer = useActivePlayer();
  const currentTurn = useCurrentTurn();
  const credits = useCredits(activePlayer);
  const winner = useWinner();
  const [selectedUnitInfo, setSelectedUnitInfo] = React.useState<{
    name: string;
    hasMoved: boolean;
    hasActed: boolean;
    hp: number;
    maxHp: number;
  } | null>(null);

  useGameEvent('UNIT_SELECTED', ({ unit }) => {
    const def = unitRegistry.get(unit.definitionId);
    if (def) {
      setSelectedUnitInfo({
        name: def.name,
        hasMoved: unit.hasMoved,
        hasActed: unit.hasActed,
        hp: unit.currentHp,
        maxHp: unit.maxHp,
      });
    }
  });

  useGameEvent('UNIT_DESELECTED', () => {
    setSelectedUnitInfo(null);
  });

  useGameEvent('UNIT_MOVED', ({ unitId }) => {
    const state = gameEngine.getState();
    if (state) {
      const unit = state.units.get(unitId);
      if (unit) {
        const def = unitRegistry.get(unit.definitionId);
        if (def) {
          setSelectedUnitInfo({
            name: def.name,
            hasMoved: unit.hasMoved,
            hasActed: unit.hasActed,
            hp: unit.currentHp,
            maxHp: unit.maxHp,
          });
        }
      }
    }
  });

  const handleEndTurn = () => {
    gameEngine.endTurn();
  };

  const handleEndUnitTurn = () => {
    gameEngine.endUnitTurn();
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

      {selectedUnitInfo && (
        <div className="unit-panel">
          <h3>{selectedUnitInfo.name}</h3>
          <div className="hp-bar-container">
            <div 
              className="hp-bar" 
              style={{ width: `${(selectedUnitInfo.hp / selectedUnitInfo.maxHp) * 100}%` }}
            />
            <span className="hp-text">
              {selectedUnitInfo.hp} / {selectedUnitInfo.maxHp}
            </span>
          </div>
          <div className="unit-status">
            <span className={selectedUnitInfo.hasMoved ? 'status-used' : 'status-ready'}>
              {selectedUnitInfo.hasMoved ? 'Moved' : 'Ready to Move'}
            </span>
            <span className={selectedUnitInfo.hasActed ? 'status-used' : 'status-ready'}>
              {selectedUnitInfo.hasActed ? 'Acted' : 'Ready to Act'}
            </span>
          </div>
          {phase === 'UNIT_SELECTED' && !selectedUnitInfo.hasActed && (
            <div className="unit-actions">
              <button onClick={() => gameEngine.showMovePreview()}>
                Move
              </button>
              <button onClick={() => gameEngine.showAttackPreviewFromCurrent()}>
                Attack
              </button>
              <button onClick={handleEndUnitTurn}>
                Wait
              </button>
            </div>
          )}
        </div>
      )}

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

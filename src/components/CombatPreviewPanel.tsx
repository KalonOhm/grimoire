import { Position, GameState } from '../game/types';
import { gameEngine } from '../game/engine';
import { unitRegistry } from '../game/registry';
import { getValidTargets } from '../game/combat';
import './CombatPreviewPanel.css';

const TILE_SIZE = 64;

interface CombatPreviewPanelProps {
  state: GameState;
  hoveredTile: Position | null;
}

export function CombatPreviewPanel({ state, hoveredTile }: CombatPreviewPanelProps) {
  const isAttackPreview = 
    state.phase === 'ACTION_PREVIEW_ATTACK_FROM_CURRENT' ||
    state.phase === 'ACTION_PREVIEW_ATTACK_AFTER_MOVE';

  if (!isAttackPreview || !hoveredTile || !state.selectedUnitId) {
    return null;
  }

  const attacker = state.units.get(state.selectedUnitId);
  if (!attacker) return null;

  const attackerDef = unitRegistry.get(attacker.definitionId);
  if (!attackerDef) return null;

  const tile = state.map[hoveredTile.y]?.[hoveredTile.x];
  if (!tile || tile.content.type !== 'unit') return null;

  const defenderId = tile.content.unitId;
  if (defenderId === state.selectedUnitId) return null;

  const defender = state.units.get(defenderId);
  if (!defender) return null;

  // Only show preview if defender is enemy and in weapon range
  if (defender.owner === attacker.owner) return null;

  // Check if in weapon range
  const validTargets = getValidTargets(attacker, attackerDef.weapons.primary, attacker.position, state);
  const isInRange = validTargets.some(t => t.instanceId === defenderId);
  if (!isInRange) return null;

  const preview = gameEngine.previewCombat(state.selectedUnitId, defenderId);
  if (!preview) return null;

  // Calculate position below selected unit
  const attackerScreenX = attacker.position.x * TILE_SIZE + TILE_SIZE / 2;
  const attackerScreenY = attacker.position.y * TILE_SIZE + TILE_SIZE;

  return (
    <div 
      className="combat-preview-panel"
      style={{
        left: attackerScreenX,
        top: attackerScreenY,
      }}
    >
      <div className="combat-preview-row">
        <span className="combat-preview-label">Your Damage:</span>
        <span className="combat-preview-value">{preview.attackerDamage}</span>
      </div>
      {preview.defenderRetaliation !== null ? (
        <div className={`combat-preview-row ${preview.poorTrade ? 'poor-trade' : ''}`}>
          <span className="combat-preview-label">Enemy Retaliation:</span>
          <span className="combat-preview-value">-{preview.defenderRetaliation}</span>
        </div>
      ) : (
        <div className="combat-preview-row">
          <span className="combat-preview-label">No retaliation</span>
        </div>
      )}
    </div>
  );
}

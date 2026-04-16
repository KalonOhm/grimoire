import { useCallback, useRef } from 'react';
import { GameState, Position } from '../game/types';
import { unitRegistry, terrainRegistry } from '../game/registry';
import { gameEngine } from '../game/engine';
import { getValidTargets } from '../game/combat';
import './GameBoard.css';

const TILE_SIZE = 64;
const PANEL_WIDTH = 120;
const PANEL_OFFSET = 40;

const TERRAIN_COLORS: Record<string, string> = {
  plains: '#4a7c3f',
  forest: '#2d5a27',
  road: '#8b7355',
  water: '#1a4d7c',
  impassable: '#3a3a3a',
  hq: '#8b0000',
  factory: '#555555',
  city: '#6b6b6b',
  ruins: '#5a4a4a',
  mountain: '#5a5a5a',
  river: '#1a4d7c',
  bridge: '#6b5335',
};

// Building terrain types that render as buildings
// Building types now come from state.buildings Map, not terrain
const getBuildingAtPosition = (buildings: Map<string, any>, x: number, y: number) => {
  for (const building of buildings.values()) {
    if (building.position.x === x && building.position.y === y) {
      return building;
    }
  }
  return null;
};



const PLAYER_COLORS = {
  1: { bg: '#4488ff', border: '#2266cc', text: '#ffffff', spent: '#88aacc', terrain: '#2a4a99' },
  2: { bg: '#ff4444', border: '#cc2222', text: '#ffffff', spent: '#cc8899', terrain: '#992222' },
  neutral: { bg: '#888888', border: '#666666', text: '#ffffff', spent: '#888888', terrain: '#555555' },
};

interface GameBoardProps {
  state: GameState;
  onStateChange?: () => void;
  onTileHover?: (position: Position) => void;
  onTileLeave?: () => void;
}

interface BuildingTriangleProps {
  position: Position;
  terrainId: string;
  buildings: Map<string, { id: string; owner: number | null; position: Position }>;
}

function BuildingTriangle({ position, terrainId, buildings }: BuildingTriangleProps) {
  let buildingOwner: number | null = null;
  for (const building of buildings.values()) {
    if (building.position.x === position.x && building.position.y === position.y) {
      buildingOwner = building.owner;
      break;
    }
  }

  const colors = buildingOwner !== null
    ? PLAYER_COLORS[buildingOwner as 1 | 2]
    : PLAYER_COLORS.neutral;

  let size = 20;
  let marginTop = 4;
  
  if (terrainId === 'hq') {
    size = 24;
    marginTop = 2;
  } else if (terrainId === 'factory') {
    size = 18;
    marginTop = 6;
  } else if (terrainId === 'city') {
    size = 16;
    marginTop = 8;
  }

  return (
    <div
      className="building"
      style={{
        position: 'absolute',
        left: TILE_SIZE / 2,
        top: TILE_SIZE / 2,
        width: 0,
        height: 0,
        borderLeft: `${size}px solid transparent`,
        borderRight: `${size}px solid transparent`,
        borderBottom: `${size * 1.2}px solid ${colors.bg}`,
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: 1,
        marginTop: `${marginTop}px`,
      }}
    />
  );
}

export function GameBoard({ state, onStateChange, onTileHover, onTileLeave }: GameBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  const handleTileClick = useCallback((x: number, y: number) => {
    const position: Position = { x, y };
    
    const freshState = gameEngine.getState();
    
    switch (freshState?.phase) {
      case 'IDLE':
      case 'UNIT_SELECTED': {
        const tile = freshState.map[y]?.[x];
        if (!tile) return;

        if (tile.content.type === 'unit') {
          const unit = gameEngine.getUnitAt(position);
          if (unit) {
            if (unit.owner === freshState.activePlayer) {
              if (freshState.phase === 'UNIT_SELECTED' && freshState.selectedUnitId === unit.instanceId) {
                gameEngine.deselectUnit();
              } else {
                if (freshState.selectedUnitId) {
                  gameEngine.deselectUnit();
                }
                gameEngine.selectUnit(unit.instanceId);
              }
            } else if (freshState.phase === 'UNIT_SELECTED' && freshState.selectedUnitId) {
              gameEngine.showAttackPreviewFromCurrent();
              const updatedState = gameEngine.getState();
              if (updatedState?.attackPreview?.targets.some(t => t.unitId === unit.instanceId)) {
                gameEngine.executeAttack(unit.instanceId);
              }
            }
          }
        } else if (tile.content.type === 'building') {
          const building = gameEngine.getBuildingAt(position);
          if (building) {
            gameEngine.selectBuilding(building.id);
          }
        } else if (freshState.phase === 'UNIT_SELECTED') {
          gameEngine.showMovePreview();
        }
        break;
      }

      case 'ACTION_PREVIEW_MOVE': {
        const movePreview = freshState.movePreview;
        if (movePreview && movePreview.reachableTiles.some(t => t.x === x && t.y === y)) {
          gameEngine.selectMoveDestination(position);
          gameEngine.executeMove(position);
        } else {
          gameEngine.hideMovePreview();
        }
        break;
      }

      case 'ACTION_PREVIEW_ATTACK_FROM_CURRENT':
      case 'ACTION_PREVIEW_ATTACK_AFTER_MOVE': {
        const attackPreview = freshState.attackPreview;
        if (attackPreview) {
          const target = attackPreview.targets.find(t => t.position.x === x && t.position.y === y);
          if (target) {
            gameEngine.executeAttack(target.unitId);
          } else {
            gameEngine.hideAttackPreview();
          }
        }
        break;
      }
    }

    onStateChange?.();
  }, [onStateChange]);

  const handleCancel = useCallback(() => {
    const freshState = gameEngine.getState();
    switch (freshState?.phase) {
      case 'UNIT_SELECTED':
      case 'UNIT_MOVED':
        gameEngine.deselectUnit();
        break;
      case 'ACTION_PREVIEW_MOVE':
        gameEngine.hideMovePreview();
        break;
      case 'ACTION_PREVIEW_ATTACK_FROM_CURRENT':
      case 'ACTION_PREVIEW_ATTACK_AFTER_MOVE':
        gameEngine.hideAttackPreview();
        break;
      case 'BUILDING_SELECTED':
        gameEngine.deselectBuilding();
        break;
    }
    onStateChange?.();
  }, [onStateChange]);

  const handleTileEnter = useCallback((x: number, y: number) => {
    onTileHover?.({ x, y });
  }, [onTileHover]);

  const handleTileLeave = useCallback(() => {
    onTileLeave?.();
  }, [onTileLeave]);

  const mapHeight = state.map.length;
  const mapWidth = state.map[0]?.length || 0;

  const isReachableTile = (x: number, y: number) => {
    return state.movePreview?.reachableTiles.some(t => t.x === x && t.y === y);
  };

  const isBlockedTile = (x: number, y: number) => {
    if (!state.movePreview?.blockedTiles) return false;
    return state.movePreview.blockedTiles.some(t => t.x === x && t.y === y);
  };

  const isBlockedByEnemy = (x: number, y: number): boolean => {
    if (!state.movePreview?.blockedTiles) return false;
    const blockedTile = state.movePreview.blockedTiles.find(t => t.x === x && t.y === y);
    if (!blockedTile) return false;
    const tileContent = state.map[blockedTile.y]?.[blockedTile.x]?.content;
    if (!tileContent || tileContent.type !== 'unit') return false;
    const blockingUnit = state.units.get(tileContent.unitId);
    if (!blockingUnit) return false;
    const selectedUnit = state.units.get(state.selectedUnitId || '');
    const isEnemy = blockingUnit.owner !== selectedUnit?.owner;
    return isEnemy;
  };

  const isAttackTarget = (x: number, y: number) => {
    return state.attackPreview?.targets.some(t => t.position.x === x && t.position.y === y);
  };

  const isSelectedUnit = (x: number, y: number) => {
    const unit = state.units.get(state.selectedUnitId || '');
    return unit?.position.x === x && unit?.position.y === y;
  };

  const isSelectedBuilding = (x: number, y: number) => {
    const building = state.buildings.get(state.selectedBuildingId || '');
    return building?.position.x === x && building?.position.y === y;
  };

  return (
    <div className="game-board-container" ref={containerRef}>
      <div 
        className="game-board"
        style={{
          width: mapWidth * TILE_SIZE,
          height: mapHeight * TILE_SIZE,
        }}
      >
        {state.map.map((row, y) =>
          row.map((tile, x) => {
            let terrainColor = TERRAIN_COLORS[tile.terrainId] || '#333333';
            
            // Check if there's a building at this position
            const buildingAtPos = getBuildingAtPosition(state.buildings, x, y);
            if (buildingAtPos && buildingAtPos.owner !== null) {
              const ownerColors = PLAYER_COLORS[buildingAtPos.owner as 1 | 2];
              terrainColor = ownerColors.terrain;
            }
            
            const isReachable = isReachableTile(x, y);
            const isTarget = isAttackTarget(x, y);
            const isUnitSelected = isSelectedUnit(x, y);
            const isBuildingSelected = isSelectedBuilding(x, y);
            const isBlocked = isBlockedTile(x, y);
            const isBlockedEnemy = isBlockedByEnemy(x, y);

            let tileClass = 'tile';
            if (isReachable) tileClass += ' tile-reachable';
            if (isTarget) tileClass += ' tile-attack-target';
            if (isUnitSelected) tileClass += ' tile-unit-selected';
            if (isBuildingSelected) tileClass += ' tile-building-selected';
            if (isBlocked) tileClass += isBlockedEnemy ? ' tile-blocked-enemy' : ' tile-blocked';

            return (
              <div
                key={`${x}-${y}`}
                className={tileClass}
                style={{
                  left: x * TILE_SIZE,
                  top: y * TILE_SIZE,
                  width: TILE_SIZE,
                  height: TILE_SIZE,
                  backgroundColor: terrainColor,
                }}
                onClick={() => handleTileClick(x, y)}
                onMouseEnter={() => handleTileEnter(x, y)}
                onMouseLeave={handleTileLeave}
              >
                {getBuildingAtPosition(state.buildings, x, y) && (
                  <BuildingTriangle 
                    position={{ x, y }} 
                    terrainId={getBuildingAtPosition(state.buildings, x, y)?.buildingType || 'factory'}
                    buildings={state.buildings}
                  />
                )}
              </div>
            );
          })
        )}

        {Array.from(state.units.values()).map(unit => {
          const definition = unitRegistry.get(unit.definitionId);
          if (!definition) return null;

          const baseColors = PLAYER_COLORS[unit.owner as 1 | 2];
          const isSpent = unit.hasActed && unit.owner === state.activePlayer;
          const colors = isSpent
            ? { 
                bg: baseColors.spent, 
                border: baseColors.spent, 
                text: '#dddddd' 
              }
            : baseColors;
          
          const letter = definition.name.charAt(0).toUpperCase();
          const hpValue = Math.max(1, Math.round((unit.currentHp / unit.maxHp) * 10));

          return (
            <div
              key={unit.instanceId}
              data-unit-id={unit.instanceId}
              className={`unit ${isSpent ? 'unit-spent' : ''}`}
              style={{
                left: unit.position.x * TILE_SIZE + TILE_SIZE / 2,
                top: unit.position.y * TILE_SIZE + TILE_SIZE / 2,
                backgroundColor: colors.bg,
                borderColor: colors.border,
              }}
            >
              <span className="unit-letter" style={{ color: colors.text }}>{letter}</span>
              <span className="unit-hp" style={{ color: colors.text }}>{hpValue}</span>
            </div>
          );
        })}

        {renderActionPanel()}
      </div>
    </div>
  );
}

function ActionPanel({ 
  unit, 
  boardWidth 
}: { 
  unit: { instanceId: string; definitionId: string; position: Position };
  boardWidth: number;
}) {
  const def = unitRegistry.get(unit.definitionId);
  if (!def) return null;

  const state = gameEngine.getState();
  if (!state) return null;

  const validTargets = getValidTargets(unit, def.weapons.primary, unit.position, state);
  const canAttack = validTargets.length > 0 && !unit.hasActed && (!unit.hasMoved || def.weapons.primary.fire_after_move);
  const canMove = !unit.hasMoved;

  const unitScreenX = unit.position.x * TILE_SIZE + TILE_SIZE / 2;
  const unitScreenY = unit.position.y * TILE_SIZE + TILE_SIZE / 2;

  const isRightSide = unitScreenX < boardWidth / 2;

  let panelLeft: number;
  if (isRightSide) {
    panelLeft = unitScreenX + PANEL_OFFSET;
  } else {
    panelLeft = unitScreenX - PANEL_WIDTH - PANEL_OFFSET;
  }

  const panelTop = unitScreenY;

  const handleMove = () => {
    gameEngine.showMovePreview();
  };

  const handleAttack = () => {
    gameEngine.showAttackPreviewFromCurrent();
  };

  const handleWait = () => {
    gameEngine.endUnitTurn();
  };

  const handleCancel = () => {
    gameEngine.deselectUnit();
  };

  return (
    <div
      className="action-panel"
      style={{
        position: 'absolute',
        left: panelLeft,
        top: panelTop,
        transform: 'translateY(-50%)',
      }}
    >
      {canMove && (
        <button onClick={handleMove}>Move</button>
      )}
      {canAttack && (
        <button onClick={handleAttack}>Attack</button>
      )}
      <button onClick={handleWait}>Wait</button>
      <button className="cancel-btn" onClick={handleCancel}>Cancel</button>
    </div>
  );
}

function BuildingActionPanel({
  building,
  boardWidth
}: {
  building: { id: string; buildingType: string; position: Position; owner: number | null };
  boardWidth: number;
}) {
  const buildingScreenX = building.position.x * TILE_SIZE + TILE_SIZE / 2;
  const buildingScreenY = building.position.y * TILE_SIZE + TILE_SIZE / 2;

  const isRightSide = buildingScreenX < boardWidth / 2;

  let panelLeft: number;
  if (isRightSide) {
    panelLeft = buildingScreenX + PANEL_OFFSET;
  } else {
    panelLeft = buildingScreenX - PANEL_WIDTH - PANEL_OFFSET;
  }

  const panelTop = buildingScreenY;

  const handleCancel = () => {
    gameEngine.deselectBuilding();
  };

  return (
    <div
      className="action-panel"
      style={{
        position: 'absolute',
        left: panelLeft,
        top: panelTop,
        transform: 'translateY(-50%)',
      }}
    >
      <button className="cancel-btn" onClick={handleCancel}>Cancel</button>
    </div>
  );
}

function renderActionPanel() {
  const state = gameEngine.getState();
  if (!state) return null;

  const phase = state.phase;
  
  // Unit action panel
  if (phase === 'UNIT_SELECTED' || phase === 'UNIT_MOVED') {
    const selectedUnitId = state.selectedUnitId;
    if (!selectedUnitId) return null;

    const unit = state.units.get(selectedUnitId);
    if (!unit || unit.hasActed) return null;

    const boardWidth = (state.map[0]?.length || 0) * TILE_SIZE;
    return <ActionPanel unit={unit} boardWidth={boardWidth} />;
  }
  
  // Building action panel
  if (phase === 'BUILDING_SELECTED') {
    const selectedBuildingId = state.selectedBuildingId;
    if (!selectedBuildingId) return null;

    const building = state.buildings.get(selectedBuildingId);
    if (!building) return null;

    const boardWidth = (state.map[0]?.length || 0) * TILE_SIZE;
    return <BuildingActionPanel building={building} boardWidth={boardWidth} />;
  }

  return null;
}

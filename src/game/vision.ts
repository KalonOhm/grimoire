import { GameState, Position, Unit } from './types';
import { unitRegistry } from './registry';

function positionKey(x: number, y: number): string {
  return `${x},${y}`;
}

function manhattanDistance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function updateVision(state: GameState): void {
  if (!state.fogOfWar) {
    return;
  }

  state.visibleTiles.clear();
  const activePlayer = state.activePlayer;
  const mapHeight = state.map.length;
  const mapWidth = state.map[0]?.length || 0;

  // Add vision from buildings
  for (const building of state.buildings.values()) {
    if (building.owner === activePlayer) {
      const radius = 2;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const checkPos = { x: building.position.x + dx, y: building.position.y + dy };
          if (
            checkPos.x >= 0 && checkPos.x < mapWidth &&
            checkPos.y >= 0 && checkPos.y < mapHeight &&
            manhattanDistance(building.position, checkPos) <= radius
          ) {
            state.visibleTiles.add(positionKey(checkPos.x, checkPos.y));
          }
        }
      }
    }
  }

  // Add vision from units
  for (const unit of state.units.values()) {
    if (unit.owner === activePlayer) {
      const def = unitRegistry.get(unit.definitionId);
      if (!def) continue;

      let vision = def.vision;
      
      // Bonus vision on mountains for foot and mech units
      if (def && (def.movement.type === 'foot' || def.movement.type === 'mech')) {
        const currentTile = state.map[unit.position.y]?.[unit.position.x];
        if (currentTile && currentTile.terrainId === 'mountain') {
          vision += 3;
        }
      }

      for (let dy = -vision; dy <= vision; dy++) {
        for (let dx = -vision; dx <= vision; dx++) {
          const checkPos = { x: unit.position.x + dx, y: unit.position.y + dy };
          if (
            checkPos.x >= 0 && checkPos.x < mapWidth &&
            checkPos.y >= 0 && checkPos.y < mapHeight &&
            manhattanDistance(unit.position, checkPos) <= vision
          ) {
            state.visibleTiles.add(positionKey(checkPos.x, checkPos.y));
          }
        }
      }
    }
  }
}

export function isUnitVisible(unit: Unit, state: GameState): boolean {
  if (!state.fogOfWar) return true;
  if (unit.owner === state.activePlayer) return true;

  const key = positionKey(unit.position.x, unit.position.y);
  if (!state.visibleTiles.has(key)) return false;

  const currentTile = state.map[unit.position.y]?.[unit.position.x];
  if (currentTile) {
    if (currentTile.terrainId === 'forest' || currentTile.terrainId === 'ruins' || currentTile.terrainId === 'stronghold') {
      // Must be adjacent (distance 1) or on the same tile (distance 0) to be seen
      for (const friendlyUnit of state.units.values()) {
        if (friendlyUnit.owner === state.activePlayer) {
          if (manhattanDistance(unit.position, friendlyUnit.position) <= 1) {
            return true;
          }
        }
      }
      return false; // Hidden in terrain, and no friendly unit is adjacent
    }
  }

  return true;
}

import { Position, Unit, MovementType, UnitCategory, GameState } from './types';
import { terrainRegistry, unitRegistry } from './registry';

interface PathNode {
  position: Position;
  g: number;
  h: number;
  f: number;
  parent: PathNode | null;
}

function manhattanDistance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function getAdjacentTiles(position: Position, mapHeight: number, mapWidth: number): Position[] {
  const { x, y } = position;
  const adjacent: Position[] = [];
  const cardinalDirections = [
    { x: x, y: y - 1 },
    { x: x, y: y + 1 },
    { x: x - 1, y: y },
    { x: x + 1, y: y },
  ];
  for (const pos of cardinalDirections) {
    if (pos.x >= 0 && pos.x < mapWidth && pos.y >= 0 && pos.y < mapHeight) {
      adjacent.push(pos);
    }
  }
  return adjacent;
}

function positionKey(pos: Position): string {
  return `${pos.x},${pos.y}`;
}

function canPassThrough(moverCategory: UnitCategory, targetCategory: UnitCategory): boolean {
  if (targetCategory === 'aircraft') {
    return false;
  }
  
  if (moverCategory === 'aircraft') {
    return true;
  }
  
  if (moverCategory === 'infantry' || moverCategory === 'mounted') {
    return true;
  }
  
  if (moverCategory === 'vehicle' || moverCategory === 'monster') {
    return targetCategory !== 'vehicle' && targetCategory !== 'monster';
  }
  
  return false;
}

function getMovementCost(terrainId: string, moveType: MovementType): number | null {
  const terrain = terrainRegistry.get(terrainId);
  if (!terrain) return null;
  if (terrain.blocks_movement) return null;

  const cost = terrain.movement_cost[moveType];
  if (cost === undefined) return null;
  if (cost < 0) return null;

  return cost;
}

export function findPath(
  from: Position,
  to: Position,
  movingUnit: Unit,
  gameState: GameState
): Position[] | null {
  const definition = unitRegistry.get(movingUnit.definitionId);
  if (!definition) return null;

  const moveType = definition.movement.type;
  const maxCost = definition.movement.points;
  const isAerial = moveType === 'fly' || moveType === 'hover';
  const moverCategory = definition.category;

  const openSet: PathNode[] = [];
  const closedSet = new Set<string>();

  const startNode: PathNode = {
    position: from,
    g: 0,
    h: manhattanDistance(from, to),
    f: manhattanDistance(from, to),
    parent: null,
  };

  openSet.push(startNode);

  while (openSet.length > 0) {
    openSet.sort((a, b) => a.f - b.f);
    const current = openSet.shift()!;

    if (current.position.x === to.x && current.position.y === to.y) {
      const path: Position[] = [];
      let node: PathNode | null = current;
      while (node) {
        path.unshift(node.position);
        node = node.parent;
      }
      return path.slice(1);
    }

    closedSet.add(positionKey(current.position));

    const neighbors: Position[] = [
      { x: current.position.x + 1, y: current.position.y },
      { x: current.position.x - 1, y: current.position.y },
      { x: current.position.x, y: current.position.y + 1 },
      { x: current.position.x, y: current.position.y - 1 },
    ];

    for (const neighbor of neighbors) {
      const key = positionKey(neighbor);

      if (closedSet.has(key)) continue;

      if (
        neighbor.x < 0 ||
        neighbor.y < 0 ||
        neighbor.x >= gameState.map[0].length ||
        neighbor.y >= gameState.map.length
      ) {
        continue;
      }

      const tile = gameState.map[neighbor.y][neighbor.x];

      if (!isAerial && tile.content.type === 'unit' && tile.content.unitId !== movingUnit.instanceId) {
        const blockingUnit = gameState.units.get(tile.content.unitId);
        if (blockingUnit) {
          const targetDef = unitRegistry.get(blockingUnit.definitionId);
          const targetCategory = targetDef?.category || 'infantry';
          
          if (!canPassThrough(moverCategory, targetCategory)) {
            continue;
          }
          
          if (blockingUnit.owner !== movingUnit.owner) {
            if (neighbor.x !== to.x || neighbor.y !== to.y) {
              continue;
            }
          }
        }
      }

      const cost = getMovementCost(tile.terrainId, moveType);
      if (cost === null) continue;

      const tentativeG = current.g + cost;

      if (tentativeG > maxCost) continue;

      const existingNode = openSet.find(
        (n) => n.position.x === neighbor.x && n.position.y === neighbor.y
      );

      if (existingNode) {
        if (tentativeG < existingNode.g) {
          existingNode.g = tentativeG;
          existingNode.f = tentativeG + existingNode.h;
          existingNode.parent = current;
        }
      } else {
        const h = manhattanDistance(neighbor, to);
        openSet.push({
          position: neighbor,
          g: tentativeG,
          h,
          f: tentativeG + h,
          parent: current,
        });
      }
    }
  }

  return null;
}

export function getReachableTiles(
  unit: Unit,
  gameState: GameState
): Position[] {
  const definition = unitRegistry.get(unit.definitionId);
  if (!definition) return [];

  const moveType = definition.movement.type;
  const maxCost = definition.movement.points;
  const isAerial = moveType === 'fly' || moveType === 'hover';
  const moverCategory = definition.category;

  const reachable: Position[] = [];
  const visited = new Map<string, number>();

  const startKey = positionKey(unit.position);
  visited.set(startKey, 0);

  const queue: Array<{ pos: Position; cost: number }> = [
    { pos: unit.position, cost: 0 },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current.cost > 0) {
      // Only empty tiles are valid destinations (buildings block movement)
      const currentTile = gameState.map[current.pos.y][current.pos.x];
      if (currentTile.content.type === 'empty') {
        reachable.push(current.pos);
      }
    }

    const neighbors: Position[] = [
      { x: current.pos.x + 1, y: current.pos.y },
      { x: current.pos.x - 1, y: current.pos.y },
      { x: current.pos.x, y: current.pos.y + 1 },
      { x: current.pos.x, y: current.pos.y - 1 },
    ];

    for (const neighbor of neighbors) {
      if (
        neighbor.x < 0 ||
        neighbor.y < 0 ||
        neighbor.x >= gameState.map[0].length ||
        neighbor.y >= gameState.map.length
      ) {
        continue;
      }

      const tile = gameState.map[neighbor.y][neighbor.x];

      if (!isAerial && tile.content.type === 'unit' && tile.content.unitId !== unit.instanceId) {
        const blockingUnit = gameState.units.get(tile.content.unitId);
        if (blockingUnit) {
          const targetDef = unitRegistry.get(blockingUnit.definitionId);
          const targetCategory = targetDef?.category || 'infantry';
          if (!canPassThrough(moverCategory, targetCategory)) {
            continue;
          }
        }
      }

      // Don't pass through buildings (fly/hover units can fly over)
      if (tile.content.type === 'building' && !isAerial) {
        continue;
      }

      const cost = getMovementCost(tile.terrainId, moveType);
      if (cost === null) continue;

      const totalCost = current.cost + cost;
      if (totalCost > maxCost) continue;

      const neighborKey = positionKey(neighbor);
      const existingCost = visited.get(neighborKey);

      if (existingCost === undefined || totalCost < existingCost) {
        visited.set(neighborKey, totalCost);
        queue.push({ pos: neighbor, cost: totalCost });
      }
    }
  }

  return reachable;
}

export function getAdjacentBlockedTiles(
  unit: Unit,
  gameState: GameState,
  reachableTiles: Position[]
): Position[] {
  const definition = unitRegistry.get(unit.definitionId);
  if (!definition) return [];

  const moveType = definition.movement.type;
  const maxCost = definition.movement.points;

  const reachableSet = new Set(reachableTiles.map(positionKey));
  const reachableCosts = new Map<string, number>();

  for (const tile of reachableTiles) {
    const cost = getMovementCostTo(unit, tile, gameState);
    if (cost !== null) {
      reachableCosts.set(positionKey(tile), cost);
    }
  }

  const blocked: Position[] = [];
  const blockedSet = new Set<string>();

  const startPositions = [unit.position, ...reachableTiles];

  for (const tile of startPositions) {
    const neighbors = [
      { x: tile.x + 1, y: tile.y },
      { x: tile.x - 1, y: tile.y },
      { x: tile.x, y: tile.y + 1 },
      { x: tile.x, y: tile.y - 1 },
    ];

    for (const neighbor of neighbors) {
      const key = positionKey(neighbor);
      if (blockedSet.has(key) || reachableSet.has(key)) continue;
      if (neighbor.x < 0 || neighbor.y < 0 ||
        neighbor.x >= gameState.map[0].length ||
        neighbor.y >= gameState.map.length) continue;

      const content = gameState.map[neighbor.y][neighbor.x].content;

      if (content.type === 'unit' || content.type === 'building') {
        const neighborTerrain = gameState.map[neighbor.y][neighbor.x].terrainId;
        const neighborCost = getMovementCost(neighborTerrain, moveType);
        if (neighborCost === null) continue;

        let totalCost: number;
        if (tile === unit.position) {
          totalCost = neighborCost;
        } else {
          const tileCost = reachableCosts.get(positionKey(tile)) ?? maxCost + 1;
          totalCost = tileCost + neighborCost;
        }

        if (totalCost <= maxCost) {
          blocked.push(neighbor);
          blockedSet.add(key);
        }
      }
    }
  }

  return blocked;
}

export function getMovementCostTo(
  unit: Unit,
  to: Position,
  gameState: GameState
): number | null {
  const path = findPath(unit.position, to, unit, gameState);
  if (!path) return null;

  const definition = unitRegistry.get(unit.definitionId);
  if (!definition) return null;

  let totalCost = 0;
  const moveType = definition.movement.type;

  for (const pos of path) {
    const tile = gameState.map[pos.y][pos.x];
    const cost = getMovementCost(tile.terrainId, moveType);
    if (cost === null) return null;
    totalCost += cost;
  }

  return totalCost;
}

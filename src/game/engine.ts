import {
  GameState,
  GamePhase,
  Unit,
  Building,
  Position,
  Tile,
  MapData,
  PlayerId,
  CombatResult,
} from './types';
import { eventBus } from './events';
import { unitRegistry, terrainRegistry, initializeArmorClasses } from './registry';
import { getReachableTiles, findPath } from './movement';
import { calculateDamage, canRetaliate, getValidTargets } from './combat';

let instanceIdCounter = 0;
function generateInstanceId(): string {
  return `unit_${++instanceIdCounter}_${Date.now()}`;
}

export function createInitialState(mapData: MapData): GameState {
  const map: Tile[][] = [];

  for (let y = 0; y < mapData.height; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < mapData.width; x++) {
      row.push({
        x,
        y,
        terrainId: mapData.terrain[y][x],
        content: { type: 'empty' },
      });
    }
    map.push(row);
  }

  const units = new Map<string, Unit>();
  const buildings = new Map<string, Building>();

  for (const unitData of mapData.units) {
    const definition = unitRegistry.get(unitData.definitionId);
    if (!definition) continue;

    const instanceId = generateInstanceId();
    const maxHp = definition.roster.model_count * definition.roster.hp_per_model;

    const unit: Unit = {
      instanceId,
      definitionId: unitData.definitionId,
      owner: unitData.owner,
      position: unitData.position,
      currentHp: maxHp,
      maxHp,
      hasMoved: false,
      hasActed: false,
      fuel: definition.fuel,
      ammo: definition.ammo,
      captureProgress: 0,
    };

    units.set(instanceId, unit);

    if (map[unitData.position.y] && map[unitData.position.y][unitData.position.x]) {
      map[unitData.position.y][unitData.position.x].content = {
        type: 'unit',
        unitId: instanceId,
      };
    }
  }

  for (const buildingData of mapData.buildings) {
    const buildingId = `building_${buildingData.position.x}_${buildingData.position.y}`;
    const building: Building = {
      id: buildingId,
      terrainId: buildingData.terrainId,
      position: buildingData.position,
      owner: null,
      captureProgress: 0,
    };

    buildings.set(buildingId, building);

    if (map[buildingData.position.y] && map[buildingData.position.y][buildingData.position.x]) {
      map[buildingData.position.y][buildingData.position.x].content = {
        type: 'building',
        buildingId,
      };
    }
  }

  return {
    phase: 'BOOT',
    activePlayer: 1,
    currentTurn: 1,
    players: {
      1: { credits: 0 },
      2: { credits: 0 },
    },
    units,
    buildings,
    map,
    selectedUnitId: null,
    selectedBuildingId: null,
    movePreview: null,
    attackPreview: null,
    winner: null,
  };
}

class GameEngine {
  private state: GameState | null = null;

  initialize(mapData: MapData): void {
    initializeArmorClasses();
    this.state = createInitialState(mapData);
    this.setPhase('TURN_START');
  }

  getState(): GameState | null {
    return this.state;
  }

  private setPhase(newPhase: GamePhase): void {
    if (!this.state) return;

    const oldPhase = this.state.phase;
    this.state.phase = newPhase;

    eventBus.emit('PHASE_CHANGE', { from: oldPhase, to: newPhase });

    if (newPhase === 'TURN_START') {
      this.processTurnStart();
    } else if (newPhase === 'TURN_END') {
      this.processTurnEnd();
    }
  }

  private processTurnStart(): void {
    if (!this.state) return;

    const player = this.state.activePlayer;

    for (const unit of this.state.units.values()) {
      if (unit.owner === player) {
        unit.hasMoved = false;
        unit.hasActed = false;
        unit.captureProgress = 0;
        eventBus.emit('UNIT_REFRESHED', { unitId: unit.instanceId });
      }
    }

    let income = 0;
    for (const building of this.state.buildings.values()) {
      if (building.owner === player) {
        const terrain = terrainRegistry.get(building.terrainId);
        if (terrain) {
          income += terrain.income_per_turn;
        }
      }
    }

    this.state.players[player].credits += income;

    eventBus.emit('INCOME_RECEIVED', { player, amount: income });
    eventBus.emit('TURN_START', { player, turn: this.state.currentTurn });

    this.setPhase('IDLE');
  }

  private processTurnEnd(): void {
    if (!this.state) return;

    const currentPlayer = this.state.activePlayer;
    eventBus.emit('TURN_END', { player: currentPlayer });

    const nextPlayer: PlayerId = currentPlayer === 1 ? 2 : 1;
    const isNewTurn = nextPlayer === 1;

    if (isNewTurn) {
      this.state.currentTurn++;
    }

    this.state.activePlayer = nextPlayer;
    this.state.selectedUnitId = null;
    this.state.selectedBuildingId = null;
    this.state.movePreview = null;
    this.state.attackPreview = null;

    this.setPhase('TURN_START');
  }

  selectUnit(unitId: string): void {
    if (!this.state) return;
    if (this.state.phase !== 'IDLE') return;

    const unit = this.state.units.get(unitId);
    if (!unit) return;

    if (unit.owner !== this.state.activePlayer) return;
    if (unit.hasActed) return;

    this.state.selectedUnitId = unitId;
    this.state.selectedBuildingId = null;

    eventBus.emit('UNIT_SELECTED', { unitId, unit });

    this.setPhase('UNIT_SELECTED');
  }

  deselectUnit(): void {
    if (!this.state) return;

    const previousUnitId = this.state.selectedUnitId;
    if (previousUnitId) {
      eventBus.emit('UNIT_DESELECTED', { unitId: previousUnitId });
    }

    this.state.selectedUnitId = null;
    this.state.movePreview = null;
    this.state.attackPreview = null;

    this.setPhase('IDLE');
  }

  selectBuilding(buildingId: string): void {
    if (!this.state) return;
    if (this.state.phase !== 'IDLE') return;

    const building = this.state.buildings.get(buildingId);
    if (!building) return;

    if (building.owner !== this.state.activePlayer) return;

    this.state.selectedBuildingId = buildingId;
    this.state.selectedUnitId = null;

    eventBus.emit('BUILDING_SELECTED', { buildingId, building });

    this.setPhase('BUILDING_SELECTED');
  }

  deselectBuilding(): void {
    if (!this.state) return;

    const previousBuildingId = this.state.selectedBuildingId;
    if (previousBuildingId) {
      eventBus.emit('BUILDING_DESELECTED', { buildingId: previousBuildingId });
    }

    this.state.selectedBuildingId = null;

    this.setPhase('IDLE');
  }

  showMovePreview(): void {
    if (!this.state) return;
    if (this.state.phase !== 'UNIT_SELECTED') return;

    const unitId = this.state.selectedUnitId;
    if (!unitId) return;

    const unit = this.state.units.get(unitId);
    if (!unit) return;

    if (unit.hasMoved) return;

    const reachableTiles = getReachableTiles(unit, this.state);
    this.state.movePreview = {
      reachableTiles,
      path: [],
      destination: null,
    };

    eventBus.emit('MOVE_PREVIEW_SHOWN', { unitId, reachableTiles });

    this.setPhase('ACTION_PREVIEW_MOVE');
  }

  hideMovePreview(): void {
    if (!this.state) return;
    if (this.state.phase !== 'ACTION_PREVIEW_MOVE') return;

    const unitId = this.state.selectedUnitId;
    if (unitId) {
      eventBus.emit('MOVE_PREVIEW_HIDDEN', { unitId });
    }

    this.state.movePreview = null;

    this.setPhase('UNIT_SELECTED');
  }

  selectMoveDestination(position: Position): void {
    if (!this.state) return;
    if (this.state.phase !== 'ACTION_PREVIEW_MOVE') return;

    const unitId = this.state.selectedUnitId;
    if (!unitId) return;

    const unit = this.state.units.get(unitId);
    if (!unit) return;

    const path = findPath(unit.position, position, unit, this.state);
    if (!path) return;

    this.state.movePreview = {
      ...this.state.movePreview!,
      path,
      destination: position,
    };

    eventBus.emit('MOVE_DESTINATION_SELECTED', { unitId, destination: position, path });

    this.setPhase('UNIT_SELECTED');
  }

  showAttackPreviewFromCurrent(): void {
    if (!this.state) return;
    if (this.state.phase !== 'UNIT_SELECTED') return;

    const unitId = this.state.selectedUnitId;
    if (!unitId) return;

    const unit = this.state.units.get(unitId);
    if (!unit) return;
    if (unit.hasActed) return;

    const definition = unitRegistry.get(unit.definitionId);
    if (!definition) return;

    const targetUnits = getValidTargets(unit, definition.weapons.primary, unit.position, this.state);
    const targets = targetUnits.map(u => ({ unitId: u.instanceId, position: u.position }));

    this.state.attackPreview = { targets };

    eventBus.emit('ATTACK_PREVIEW_SHOWN', { unitId, targets });

    this.setPhase('ACTION_PREVIEW_ATTACK_FROM_CURRENT');
  }

  showAttackPreviewAfterMove(position: Position): void {
    if (!this.state) return;

    const unitId = this.state.selectedUnitId;
    if (!unitId) return;

    const unit = this.state.units.get(unitId);
    if (!unit) return;

    const definition = unitRegistry.get(unit.definitionId);
    if (!definition) return;

    if (!definition.weapons.primary.fire_after_move) {
      return;
    }

    const targetUnits = getValidTargets(unit, definition.weapons.primary, position, this.state);
    const targets = targetUnits.map(u => ({ unitId: u.instanceId, position: u.position }));

    this.state.attackPreview = { targets };

    eventBus.emit('ATTACK_PREVIEW_SHOWN', { unitId, targets });

    this.setPhase('ACTION_PREVIEW_ATTACK_AFTER_MOVE');
  }

  hideAttackPreview(): void {
    if (!this.state) return;

    const unitId = this.state.selectedUnitId;
    if (unitId) {
      eventBus.emit('ATTACK_PREVIEW_HIDDEN', { unitId });
    }

    this.state.attackPreview = null;

    if (this.state.phase === 'ACTION_PREVIEW_ATTACK_FROM_CURRENT') {
      this.setPhase('UNIT_SELECTED');
    } else if (this.state.phase === 'ACTION_PREVIEW_ATTACK_AFTER_MOVE') {
      this.setPhase('UNIT_SELECTED');
    }
  }

  executeMove(destination: Position): void {
    if (!this.state) return;
    if (this.state.phase !== 'ACTION_PREVIEW_MOVE' && this.state.phase !== 'UNIT_SELECTED') return;

    const unitId = this.state.selectedUnitId;
    if (!unitId) return;

    const unit = this.state.units.get(unitId);
    if (!unit) return;

    const oldPosition = { ...unit.position };

    this.state.map[oldPosition.y][oldPosition.x].content = { type: 'empty' };

    unit.position = destination;

    this.state.map[destination.y][destination.x].content = {
      type: 'unit',
      unitId,
    };

    unit.hasMoved = true;

    eventBus.emit('UNIT_MOVED', { unitId, from: oldPosition, to: destination });

    this.state.movePreview = null;

    this.showAttackPreviewAfterMove(destination);
  }

  executeAttack(targetUnitId: string): void {
    if (!this.state) return;
    if (
      this.state.phase !== 'ACTION_PREVIEW_ATTACK_FROM_CURRENT' &&
      this.state.phase !== 'ACTION_PREVIEW_ATTACK_AFTER_MOVE'
    ) {
      return;
    }

    const attackerId = this.state.selectedUnitId;
    if (!attackerId) return;

    const attacker = this.state.units.get(attackerId);
    const defender = this.state.units.get(targetUnitId);

    if (!attacker || !defender) return;

    const definition = unitRegistry.get(attacker.definitionId);
    if (!definition) return;

    const attackPosition = attacker.position;

    this.setPhase('UNIT_ACTION_RESOLVE');

    const combatResult = this.resolveAttack(attacker, defender, definition.weapons.primary, attackPosition);

    eventBus.emit('UNIT_ATTACKED', { combat: combatResult });

    if (combatResult.defenderDestroyed) {
      this.removeUnit(defender.instanceId);
    }

    if (combatResult.attackerDestroyed) {
      this.removeUnit(attacker.instanceId);
    }

    attacker.hasActed = true;

    this.state.attackPreview = null;
    this.state.selectedUnitId = null;

    this.checkWinCondition();

    if (this.state && !this.state.winner) {
      this.setPhase('UNIT_SPENT');
    }
  }

  private resolveAttack(
    attacker: Unit,
    defender: Unit,
    weapon: { damage_vs_armor: Record<string, number>; range_penalty_multiplier: number; min_range: number; max_range: number; uses_ammo: boolean },
    fromPosition: Position
  ): CombatResult {
    const damageDealt = calculateDamage(attacker, defender, weapon as any, fromPosition, this.state!);

    const defenderAfterDamage = Math.max(0, defender.currentHp - damageDealt);
    const defenderDestroyed = defenderAfterDamage <= 0;

    defender.currentHp = defenderAfterDamage;

    let retaliationDamage: number | undefined;
    let attackerDestroyed: boolean | undefined;

    if (!defenderDestroyed && canRetaliate(defender, attacker, defender.position, this.state!)) {
      const defenderDef = unitRegistry.get(defender.definitionId);
      if (defenderDef) {
        const retaliationWeapon = defenderDef.weapons.secondary || defenderDef.weapons.primary;
        retaliationDamage = calculateDamage(defender, attacker, retaliationWeapon, defender.position, this.state!);

        const attackerAfterRetaliation = Math.max(0, attacker.currentHp - retaliationDamage);
        attackerDestroyed = attackerAfterRetaliation <= 0;
        attacker.currentHp = attackerAfterRetaliation;
      }
    }

    return {
      attackerId: attacker.instanceId,
      defenderId: defender.instanceId,
      damageDealt,
      defenderDestroyed,
      retaliationDamage,
      attackerDestroyed,
    };
  }

  private removeUnit(unitId: string): void {
    if (!this.state) return;

    const unit = this.state.units.get(unitId);
    if (!unit) return;

    this.state.map[unit.position.y][unit.position.x].content = { type: 'empty' };

    this.state.units.delete(unitId);

    eventBus.emit('UNIT_DESTROYED', { unitId });
  }

  endUnitTurn(): void {
    if (!this.state) return;
    if (this.state.phase !== 'UNIT_SELECTED' && this.state.phase !== 'UNIT_SPENT') return;

    const unitId = this.state.selectedUnitId;
    if (unitId) {
      const unit = this.state.units.get(unitId);
      if (unit) {
        unit.hasActed = true;
        unit.hasMoved = true;
      }
    }

    this.state.selectedUnitId = null;
    this.state.movePreview = null;
    this.state.attackPreview = null;

    this.setPhase('IDLE');
  }

  endTurn(): void {
    if (!this.state) return;
    if (this.state.phase === 'GAME_OVER') return;

    this.state.selectedUnitId = null;
    this.state.selectedBuildingId = null;
    this.state.movePreview = null;
    this.state.attackPreview = null;

    this.setPhase('TURN_END');
  }

  private checkWinCondition(): void {
    if (!this.state) return;

    let player1Units = 0;
    let player2Units = 0;
    let player1HqDestroyed = false;
    let player2HqDestroyed = false;

    for (const unit of this.state.units.values()) {
      if (unit.owner === 1) player1Units++;
      if (unit.owner === 2) player2Units++;
    }

    for (const building of this.state.buildings.values()) {
      const terrain = terrainRegistry.get(building.terrainId);
      if (terrain && terrain.id === 'hq') {
        if (building.owner === 1) player1HqDestroyed = building.captureProgress >= 100;
        if (building.owner === 2) player2HqDestroyed = building.captureProgress >= 100;
      }
    }

    if (player2Units === 0 || player2HqDestroyed) {
      this.state.winner = 1;
      this.setPhase('GAME_OVER');
      eventBus.emit('GAME_OVER', { winner: 1 });
      return;
    }

    if (player1Units === 0 || player1HqDestroyed) {
      this.state.winner = 2;
      this.setPhase('GAME_OVER');
      eventBus.emit('GAME_OVER', { winner: 2 });
      return;
    }
  }

  startGame(): void {
    if (!this.state) return;
    this.setPhase('TURN_START');
  }

  getTileAt(position: Position): Tile | null {
    if (!this.state) return null;
    if (
      position.y < 0 ||
      position.y >= this.state.map.length ||
      position.x < 0 ||
      position.x >= this.state.map[0].length
    ) {
      return null;
    }
    return this.state.map[position.y][position.x];
  }

  getUnitAt(position: Position): Unit | null {
    const tile = this.getTileAt(position);
    if (!tile) return null;
    if (tile.content.type !== 'unit') return null;
    return this.state!.units.get(tile.content.unitId) || null;
  }

  getBuildingAt(position: Position): Building | null {
    const tile = this.getTileAt(position);
    if (!tile) return null;
    if (tile.content.type !== 'building') return null;
    return this.state!.buildings.get(tile.content.buildingId) || null;
  }
}

export const gameEngine = new GameEngine();

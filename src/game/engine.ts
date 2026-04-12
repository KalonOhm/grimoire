// ============================================================================
// GAME ENGINE - Core game logic and state machine
// ============================================================================
// This file is framework-agnostic. It contains all game rules and state
// management. Phaser and React only interact with it through the EventBus.

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

// ============================================================================
// INSTANCE ID GENERATION
// ============================================================================
// Each unit gets a unique instance ID when created.
// This separates the unit template (definitionId) from the runtime instance.
let instanceIdCounter = 0;
function generateInstanceId(): string {
  return `unit_${++instanceIdCounter}_${Date.now()}`;
}

// ============================================================================
// STATE INITIALIZATION
// ============================================================================

/**
 * Creates the initial game state from map data.
 * Called once at game start to instantiate all entities.
 */
export function createInitialState(mapData: MapData): GameState {
  // Build the tile grid from terrain data
  const map: Tile[][] = [];

  for (let y = 0; y < mapData.height; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < mapData.width; x++) {
      row.push({
        x,
        y,
        terrainId: mapData.terrain[y][x],
        content: { type: 'empty' }, // Start with empty tiles
      });
    }
    map.push(row);
  }

  // Initialize entity storage
  const units = new Map<string, Unit>();
  const buildings = new Map<string, Building>();

  // Create units from map data
  for (const unitData of mapData.units) {
    const definition = unitRegistry.get(unitData.definitionId);
    if (!definition) continue; // Skip if unit definition not found

    const instanceId = generateInstanceId();
    // Total HP = models × HP per model (e.g., 5 × 20 = 100)
    const maxHp = definition.roster.model_count * definition.roster.hp_per_model;

    const unit: Unit = {
      instanceId,
      definitionId: unitData.definitionId,
      owner: unitData.owner,
      position: unitData.position,
      currentHp: maxHp,      // Start at full HP
      maxHp,
      hasMoved: false,      // Fresh units can move
      hasActed: false,      // Fresh units can act
      fuel: definition.fuel,
      ammo: definition.ammo,
      captureProgress: 0,
    };

    units.set(instanceId, unit);

    // Update tile content to show unit
    if (map[unitData.position.y] && map[unitData.position.y][unitData.position.x]) {
      map[unitData.position.y][unitData.position.x].content = {
        type: 'unit',
        unitId: instanceId,
      };
    }
  }

  // Create buildings from map data
  for (const buildingData of mapData.buildings) {
    const buildingId = `building_${buildingData.position.x}_${buildingData.position.y}`;
    const building: Building = {
      id: buildingId,
      terrainId: buildingData.terrainId,
      position: buildingData.position,
      owner: null, // Start neutral
      captureProgress: 0,
    };

    buildings.set(buildingId, building);

    // Update tile content to show building
    if (map[buildingData.position.y] && map[buildingData.position.y][buildingData.position.x]) {
      map[buildingData.position.y][buildingData.position.x].content = {
        type: 'building',
        buildingId,
      };
    }
  }

  return {
    phase: 'BOOT',
    activePlayer: 1,     // Player 1 goes first
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

// ============================================================================
// GAME ENGINE CLASS
// ============================================================================

class GameEngine {
  // Current game state - null until initialized
  private state: GameState | null = null;

  /**
   * Initialize the game with a map.
   * Sets up registries, creates initial state, starts the game.
   */
  initialize(mapData: MapData): void {
    // Initialize the armor class registry
    initializeArmorClasses();
    
    // Create the initial game state
    this.state = createInitialState(mapData);
    
    // Start the game by entering TURN_START phase
    this.setPhase('TURN_START');
  }

  /** Get current game state (read-only externally) */
  getState(): GameState | null {
    return this.state;
  }

  // ========================================================================
  // PHASE MANAGEMENT
  // ========================================================================

  /**
   * Set the current phase and trigger side effects.
   * This is the central state machine transition function.
   */
  private setPhase(newPhase: GamePhase): void {
    if (!this.state) return;

    const oldPhase = this.state.phase;
    this.state.phase = newPhase;

    // Notify all listeners of the phase change
    eventBus.emit('PHASE_CHANGE', { from: oldPhase, to: newPhase });

    // Handle automatic phase transitions
    if (newPhase === 'TURN_START') {
      this.processTurnStart();
    } else if (newPhase === 'TURN_END') {
      this.processTurnEnd();
    }
  }

  /**
   * Process the start of a turn.
   * 1. Refresh all player's units (reset hasMoved, hasActed)
   * 2. Collect income from owned buildings
   * 3. Transition to IDLE
   */
  private processTurnStart(): void {
    if (!this.state) return;

    const player = this.state.activePlayer;

    // Refresh all units for the active player
    for (const unit of this.state.units.values()) {
      if (unit.owner === player) {
        unit.hasMoved = false;
        unit.hasActed = false;
        unit.captureProgress = 0;
        eventBus.emit('UNIT_REFRESHED', { unitId: unit.instanceId });
      }
    }

    // Calculate income from owned buildings
    let income = 0;
    for (const building of this.state.buildings.values()) {
      if (building.owner === player) {
        const terrain = terrainRegistry.get(building.terrainId);
        if (terrain) {
          income += terrain.income_per_turn;
        }
      }
    }

    // Add income to player's credits
    this.state.players[player].credits += income;

    // Emit events for UI updates
    eventBus.emit('INCOME_RECEIVED', { player, amount: income });
    eventBus.emit('TURN_START', { player, turn: this.state.currentTurn });

    // Transition to idle state, waiting for player input
    this.setPhase('IDLE');
  }

  /**
   * Process the end of a turn.
   * 1. Emit TURN_END event
   * 2. Switch to other player
   * 3. Increment turn counter if returning to player 1
   * 4. Clear selections
   * 5. Start new turn
   */
  private processTurnEnd(): void {
    if (!this.state) return;

    const currentPlayer = this.state.activePlayer;
    eventBus.emit('TURN_END', { player: currentPlayer });

    // Switch to the other player
    const nextPlayer: PlayerId = currentPlayer === 1 ? 2 : 1;
    
    // If we're going back to player 1, increment turn counter
    const isNewTurn = nextPlayer === 1;
    if (isNewTurn) {
      this.state.currentTurn++;
    }

    this.state.activePlayer = nextPlayer;
    
    // Clear any selections
    this.state.selectedUnitId = null;
    this.state.selectedBuildingId = null;
    this.state.movePreview = null;
    this.state.attackPreview = null;

    // Start the next turn
    this.setPhase('TURN_START');
  }

  // ========================================================================
  // UNIT SELECTION AND ACTIONS
  // ========================================================================

  /**
   * Select a unit for actions.
   * Only works in IDLE phase, only for active player's ready units.
   */
  selectUnit(unitId: string): void {
    if (!this.state) return;
    if (this.state.phase !== 'IDLE') return;

    const unit = this.state.units.get(unitId);
    if (!unit) return;

    // Can only select own units
    if (unit.owner !== this.state.activePlayer) return;
    
    // Can't select units that have already acted
    if (unit.hasActed) return;

    this.state.selectedUnitId = unitId;
    this.state.selectedBuildingId = null;

    eventBus.emit('UNIT_SELECTED', { unitId, unit });

    this.setPhase('UNIT_SELECTED');
  }

  /** Deselect current unit and return to IDLE */
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

  /**
   * Select a building for actions (production, etc.)
   * Only works in IDLE phase for owned buildings.
   */
  selectBuilding(buildingId: string): void {
    if (!this.state) return;
    if (this.state.phase !== 'IDLE') return;

    const building = this.state.buildings.get(buildingId);
    if (!building) return;

    // Can only select own buildings
    if (building.owner !== this.state.activePlayer) return;

    this.state.selectedBuildingId = buildingId;
    this.state.selectedUnitId = null;

    eventBus.emit('BUILDING_SELECTED', { buildingId, building });

    this.setPhase('BUILDING_SELECTED');
  }

  /** Deselect current building and return to IDLE */
  deselectBuilding(): void {
    if (!this.state) return;

    const previousBuildingId = this.state.selectedBuildingId;
    if (previousBuildingId) {
      eventBus.emit('BUILDING_DESELECTED', { buildingId: previousBuildingId });
    }

    this.state.selectedBuildingId = null;

    this.setPhase('IDLE');
  }

  // ========================================================================
  // MOVEMENT SYSTEM
  // ========================================================================

  /**
   * Show movement preview for selected unit.
   * Calculates and highlights all reachable tiles.
   */
  showMovePreview(): void {
    if (!this.state) return;
    if (this.state.phase !== 'UNIT_SELECTED') return;

    const unitId = this.state.selectedUnitId;
    if (!unitId) return;

    const unit = this.state.units.get(unitId);
    if (!unit) return;

    // Can't move if already moved
    if (unit.hasMoved) return;

    // Get all tiles this unit can reach
    const reachableTiles = getReachableTiles(unit, this.state);
    
    this.state.movePreview = {
      reachableTiles,
      path: [],
      destination: null,
    };

    eventBus.emit('MOVE_PREVIEW_SHOWN', { unitId, reachableTiles });

    this.setPhase('ACTION_PREVIEW_MOVE');
  }

  /** Hide movement preview and return to UNIT_SELECTED */
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

  /**
   * Select a destination tile from the movement preview.
   * Commits to moving but doesn't execute until confirmed.
   */
  selectMoveDestination(position: Position): void {
    if (!this.state) return;
    if (this.state.phase !== 'ACTION_PREVIEW_MOVE') return;

    const unitId = this.state.selectedUnitId;
    if (!unitId) return;

    const unit = this.state.units.get(unitId);
    if (!unit) return;

    // Calculate path to destination
    const path = findPath(unit.position, position, unit, this.state);
    if (!path) return; // No valid path

    this.state.movePreview = {
      ...this.state.movePreview!,
      path,
      destination: position,
    };

    eventBus.emit('MOVE_DESTINATION_SELECTED', { unitId, destination: position, path });
  }

  /**
   * Execute the move to the selected destination.
   * Updates unit position and shows attack preview if applicable.
   */
  executeMove(destination: Position): void {
    if (!this.state) return;
    
    // Can execute from move preview or directly from selected unit
    const validPhases = ['ACTION_PREVIEW_MOVE', 'UNIT_SELECTED'];
    if (!validPhases.includes(this.state.phase)) return;

    const unitId = this.state.selectedUnitId;
    if (!unitId) return;

    const unit = this.state.units.get(unitId);
    if (!unit) return;

    const oldPosition = { ...unit.position };

    // Clear old position
    this.state.map[oldPosition.y][oldPosition.x].content = { type: 'empty' };

    // Update unit position
    unit.position = destination;

    // Set new position
    this.state.map[destination.y][destination.x].content = {
      type: 'unit',
      unitId,
    };

    // Mark as moved
    unit.hasMoved = true;

    // Emit move event
    eventBus.emit('UNIT_MOVED', { unitId, from: oldPosition, to: destination });

    // Clear move preview
    this.state.movePreview = null;

    // Show attack preview from new position (if weapon allows fire-after-move)
    this.showAttackPreviewAfterMove(destination);
  }

  // ========================================================================
  // COMBAT SYSTEM
  // ========================================================================

  /**
   * Show attack preview from current unit position.
   * Highlights all valid targets in range.
   */
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

    // Get all valid targets in range
    const targetUnits = getValidTargets(unit, definition.weapons.primary, unit.position, this.state);
    // Transform to event format
    const targets = targetUnits.map(u => ({ unitId: u.instanceId, position: u.position }));

    this.state.attackPreview = { targets };

    eventBus.emit('ATTACK_PREVIEW_SHOWN', { unitId, targets });

    this.setPhase('ACTION_PREVIEW_ATTACK_FROM_CURRENT');
  }

  /**
   * Show attack preview from a position after moving.
   * Only shows if weapon allows fire-after-move.
   */
  showAttackPreviewAfterMove(position: Position): void {
    if (!this.state) return;

    const unitId = this.state.selectedUnitId;
    if (!unitId) return;

    const unit = this.state.units.get(unitId);
    if (!unit) return;

    const definition = unitRegistry.get(unit.definitionId);
    if (!definition) return;

    // Check if weapon allows fire-after-move
    if (!definition.weapons.primary.fire_after_move) {
      // Can't fire after moving, go directly to UNIT_SELECTED
      this.setPhase('UNIT_SELECTED');
      return;
    }

    // Get targets from new position
    const targetUnits = getValidTargets(unit, definition.weapons.primary, position, this.state);
    const targets = targetUnits.map(u => ({ unitId: u.instanceId, position: u.position }));

    this.state.attackPreview = { targets };

    eventBus.emit('ATTACK_PREVIEW_SHOWN', { unitId, targets });

    this.setPhase('ACTION_PREVIEW_ATTACK_AFTER_MOVE');
  }

  /** Hide attack preview and return to previous state */
  hideAttackPreview(): void {
    if (!this.state) return;

    const unitId = this.state.selectedUnitId;
    if (unitId) {
      eventBus.emit('ATTACK_PREVIEW_HIDDEN', { unitId });
    }

    this.state.attackPreview = null;

    // Return to appropriate state based on how we got here
    if (this.state.phase === 'ACTION_PREVIEW_ATTACK_FROM_CURRENT' ||
        this.state.phase === 'ACTION_PREVIEW_ATTACK_AFTER_MOVE') {
      this.setPhase('UNIT_SELECTED');
    }
  }

  /**
   * Execute an attack on a target unit.
   * Handles all combat resolution including retaliation.
   */
  executeAttack(targetUnitId: string): void {
    if (!this.state) return;
    
    const validPhases = ['ACTION_PREVIEW_ATTACK_FROM_CURRENT', 'ACTION_PREVIEW_ATTACK_AFTER_MOVE'];
    if (!validPhases.includes(this.state.phase)) return;

    const attackerId = this.state.selectedUnitId;
    if (!attackerId) return;

    const attacker = this.state.units.get(attackerId);
    const defender = this.state.units.get(targetUnitId);

    if (!attacker || !defender) return;

    const definition = unitRegistry.get(attacker.definitionId);
    if (!definition) return;

    // Get position to attack from (current position or move destination)
    const attackPosition = attacker.position;

    // Transition to resolve phase
    this.setPhase('UNIT_ACTION_RESOLVE');

    // Resolve the attack
    const combatResult = this.resolveAttack(
      attacker,
      defender,
      definition.weapons.primary,
      attackPosition
    );

    // Emit combat event
    eventBus.emit('UNIT_ATTACKED', { combat: combatResult });

    // Apply destruction
    if (combatResult.defenderDestroyed) {
      this.removeUnit(defender.instanceId);
    }

    if (combatResult.attackerDestroyed) {
      this.removeUnit(attacker.instanceId);
    }

    // Mark attacker as having acted
    attacker.hasActed = true;

    // Clear state
    this.state.attackPreview = null;
    this.state.selectedUnitId = null;

    // Check win conditions
    this.checkWinCondition();

    // If game not over, transition to UNIT_SPENT then IDLE
    if (this.state && !this.state.winner) {
      this.setPhase('UNIT_SPENT');
    }
  }

  /**
   * Core combat resolution logic.
   * 1. Calculate damage from attacker to defender
   * 2. Apply damage to defender
   * 3. If defender survives and can retaliate, calculate retaliation
   * 4. Return combat result
   */
  private resolveAttack(
    attacker: Unit,
    defender: Unit,
    weapon: { damage_vs_armor: Record<string, number>; range_penalty_multiplier: number; min_range: number; max_range: number; uses_ammo: boolean },
    fromPosition: Position
  ): CombatResult {
    // Calculate primary damage
    const damageDealt = calculateDamage(attacker, defender, weapon as any, fromPosition, this.state!);

    // Apply damage to defender
    const defenderAfterDamage = Math.max(0, defender.currentHp - damageDealt);
    const defenderDestroyed = defenderAfterDamage <= 0;
    defender.currentHp = defenderAfterDamage;

    // Handle retaliation if defender survives
    let retaliationDamage: number | undefined;
    let attackerDestroyed: boolean | undefined;

    if (!defenderDestroyed && canRetaliate(defender, attacker, defender.position, this.state!)) {
      const defenderDef = unitRegistry.get(defender.definitionId);
      if (defenderDef) {
        // Use secondary weapon if available, otherwise primary
        const retaliationWeapon = defenderDef.weapons.secondary || defenderDef.weapons.primary;
        retaliationDamage = calculateDamage(defender, attacker, retaliationWeapon, defender.position, this.state!);

        // Apply retaliation damage
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

  /** Remove a destroyed unit from the game */
  private removeUnit(unitId: string): void {
    if (!this.state) return;

    const unit = this.state.units.get(unitId);
    if (!unit) return;

    // Clear tile
    this.state.map[unit.position.y][unit.position.x].content = { type: 'empty' };

    // Remove from units map
    this.state.units.delete(unitId);

    // Emit destruction event
    eventBus.emit('UNIT_DESTROYED', { unitId });
  }

  // ========================================================================
  // TURN MANAGEMENT
  // ========================================================================

  /** End the current unit's turn without further actions */
  endUnitTurn(): void {
    if (!this.state) return;
    
    const validPhases = ['UNIT_SELECTED', 'UNIT_SPENT'];
    if (!validPhases.includes(this.state.phase)) return;

    const unitId = this.state.selectedUnitId;
    if (unitId) {
      const unit = this.state.units.get(unitId);
      if (unit) {
        unit.hasActed = true;
        unit.hasMoved = true;
      }
    }

    // Clear selections
    this.state.selectedUnitId = null;
    this.state.movePreview = null;
    this.state.attackPreview = null;

    this.setPhase('IDLE');
  }

  /** End the current player's turn */
  endTurn(): void {
    if (!this.state) return;
    if (this.state.phase === 'GAME_OVER') return;

    // Clear all selections
    this.state.selectedUnitId = null;
    this.state.selectedBuildingId = null;
    this.state.movePreview = null;
    this.state.attackPreview = null;

    // Trigger turn end processing
    this.setPhase('TURN_END');
  }

  // ========================================================================
  // WIN CONDITIONS
  // ========================================================================

  /**
   * Check if the game has been won.
   * Win conditions:
   * 1. Destroy all enemy units
   * 2. Capture enemy HQ (captureProgress >= 100)
   */
  private checkWinCondition(): void {
    if (!this.state) return;

    let player1Units = 0;
    let player2Units = 0;
    let player1HqDestroyed = false;
    let player2HqDestroyed = false;

    // Count units per player
    for (const unit of this.state.units.values()) {
      if (unit.owner === 1) player1Units++;
      if (unit.owner === 2) player2Units++;
    }

    // Check HQ capture status
    for (const building of this.state.buildings.values()) {
      const terrain = terrainRegistry.get(building.terrainId);
      if (terrain && terrain.id === 'hq') {
        // HQ is "destroyed" when fully captured by enemy
        if (building.owner === 1 && building.captureProgress >= 100) {
          player2HqDestroyed = true; // Player 2 captured Player 1's HQ
        }
        if (building.owner === 2 && building.captureProgress >= 100) {
          player1HqDestroyed = true; // Player 1 captured Player 2's HQ
        }
      }
    }

    // Check win conditions
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

  // ========================================================================
  // UTILITY METHODS
  // ========================================================================

  /** Start the game (used after initialization) */
  startGame(): void {
    if (!this.state) return;
    this.setPhase('TURN_START');
  }

  /** Get tile at position, or null if out of bounds */
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

  /** Get unit at position, or null if no unit there */
  getUnitAt(position: Position): Unit | null {
    const tile = this.getTileAt(position);
    if (!tile) return null;
    if (tile.content.type !== 'unit') return null;
    return this.state!.units.get(tile.content.unitId) || null;
  }

  /** Get building at position, or null if no building there */
  getBuildingAt(position: Position): Building | null {
    const tile = this.getTileAt(position);
    if (!tile) return null;
    if (tile.content.type !== 'building') return null;
    return this.state!.buildings.get(tile.content.buildingId) || null;
  }
}

// Export singleton instance
export const gameEngine = new GameEngine();

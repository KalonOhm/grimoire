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
  BuildingType,
  Position,
  Tile,
  MapData,
  PlayerId,
  CombatResult,
  CombatPreview,
} from './types';
import { eventBus } from './events';
import { unitRegistry, initializeArmorClasses } from './registry';
import { getReachableTiles, getAdjacentBlockedTiles, findPath, getMovementCostTo, getAdjacentTiles } from './movement';
import { calculateDamage, canRetaliate, getBestRetaliationWeapon, getBestWeaponForTarget, getAllValidTargetsInRange } from './combat';

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

  // Create Wargroove-style buildings from map data
  // Buildings are separate entities with HP, not embedded in terrain
  
  const BUILDING_HP: Record<BuildingType, number> = {
    hq: 20,
    factory: 15,
    city: 10,
  };

  // First pass: determine which player each HQ belongs to based on proximity to starting units
  const hqOwnership = new Map<string, PlayerId | null>();
  for (const buildingData of mapData.buildings) {
    if (buildingData.buildingType === 'hq') {
      let closestPlayer1Dist = Infinity;
      let closestPlayer2Dist = Infinity;
      
      for (const unitData of mapData.units) {
        const dist = Math.abs(unitData.position.x - buildingData.position.x) + 
                     Math.abs(unitData.position.y - buildingData.position.y);
        if (unitData.owner === 1 && dist < closestPlayer1Dist) {
          closestPlayer1Dist = dist;
        }
        if (unitData.owner === 2 && dist <closestPlayer2Dist) {
          closestPlayer2Dist = dist;
        }
      }
      
      const buildingId = `building_${buildingData.position.x}_${buildingData.position.y}`;
      hqOwnership.set(buildingId, closestPlayer1Dist <= closestPlayer2Dist ? 1 : 2);
    }
  }
  
  for (const buildingData of mapData.buildings) {
    const buildingId = `building_${buildingData.position.x}_${buildingData.position.y}`;
    const maxHp = BUILDING_HP[buildingData.buildingType];
    const building: Building = {
      id: buildingId,
      buildingType: buildingData.buildingType,
      position: buildingData.position,
      owner: hqOwnership.get(buildingId) || null,
      maxHp,
      hp: maxHp,
    };

    buildings.set(buildingId, building);

    // Update tile content to show building
    if (map[buildingData.position.y] && map[buildingData.position.y][buildingData.position.x]) {
      map[buildingData.position.y][buildingData.position.x].content = {
        type: 'building',
        buildingId: buildingId,
      };
    }
  }

  // Create units from map data (placed AFTER buildings so they overwrite building tiles)
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
      supply: definition.supply,
      ammo: definition.ammo,
      captureProgress: 0,
      capturingBuildingId: null,
    };

    units.set(instanceId, unit);

    // Update tile content to show unit (overwrites building if on same tile)
    if (map[unitData.position.y] && map[unitData.position.y][unitData.position.x]) {
      map[unitData.position.y][unitData.position.x].content = {
        type: 'unit',
        unitId: instanceId,
      };
    }
  }

  return {
    phase: 'BOOT',
    activePlayer: 1,     // Player 1 goes first
    currentTurn: 1,
    players: {
      1: { resources: 0 },
      2: { resources: 0 },
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
    } else if (newPhase === 'UNIT_SPENT') {
      // Auto-transition from UNIT_SPENT back to IDLE
      this.state.selectedUnitId = null;
      this.state.movePreview = null;
      this.state.attackPreview = null;
      this.setPhase('IDLE');
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

        // Daily supply consumption for air units
        const definition = unitRegistry.get(unit.definitionId);
        if (definition && definition.movement.type === 'air') {
          const DAILY_AIR_SUPPLY = 2;
          unit.supply -= DAILY_AIR_SUPPLY;
          if (unit.supply <= 0) {
            unit.supply = 0;
            this.removeUnit(unit.instanceId);
            eventBus.emit('UNIT_DESTROYED', { unitId: unit.instanceId });
            this.checkWinCondition();
            continue;
          }
        }

        eventBus.emit('UNIT_REFRESHED', { unitId: unit.instanceId });
      }
    }

    // Calculate income from owned buildings (Wargroove-style: based on building type)
    const BUILDING_INCOME: Record<BuildingType, number> = {
      hq: 1000,
      factory: 500,
      city: 250,
    };
    let income = 0;
    for (const building of this.state.buildings.values()) {
      if (building.owner === player) {
        income += BUILDING_INCOME[building.buildingType];
      }
    }

    // Add income to player's resources
    this.state.players[player].resources += income;

    // Repair adjacent units and resupply
    const BUILDING_REPAIR: Record<BuildingType, number> = {
      hq: 5,
      factory: 5,
      city: 2,
    };
    const mapHeight = this.state.map.length;
    const mapWidth = this.state.map[0]?.length || 0;

    for (const building of this.state.buildings.values()) {
      if (building.owner !== player) continue;

      const repairAmount = BUILDING_REPAIR[building.buildingType];
      const adjacentPositions = getAdjacentTiles(building.position, mapHeight, mapWidth);

      for (const pos of adjacentPositions) {
        const tileContent = this.state.map[pos.y]?.[pos.x]?.content;
        if (tileContent?.type !== 'unit') continue;

        const unit = this.state.units.get(tileContent.unitId);
        if (!unit || unit.owner !== player) continue;

        const definition = unitRegistry.get(unit.definitionId);
        if (!definition) continue;

        let actualRepair = 0;
        let repairCost = 0;

        // Only repair if damaged
        if (unit.currentHp < unit.maxHp) {
          const hpToHeal = Math.min(repairAmount, unit.maxHp - unit.currentHp);
          const costPerHp = Math.floor(definition.cost * 0.1);
          repairCost = hpToHeal * costPerHp;

          // Check if player can afford
          if (this.state.players[player].resources >= repairCost) {
            this.state.players[player].resources -= repairCost;
            unit.currentHp = Math.min(unit.maxHp, unit.currentHp + repairAmount);
            actualRepair = hpToHeal;
          }
        }

        // Always restore supply and ammo (free)
        unit.supply = definition.supply;
        unit.ammo = definition.ammo;

        if (actualRepair > 0 || definition.supply === unit.supply || definition.ammo === unit.ammo) {
          eventBus.emit('UNIT_REPAIRED', {
            unitId: unit.instanceId,
            hpRestored: actualRepair,
            supplyRestored: true,
            cost: repairCost,
          });
        }
      }
    }

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

    // Process capture completion: at end of each player's turn,
    // check if the OPPONENT had units capturing buildings.
    // If any survived opponent's turn, capture completes.
    const opponent: PlayerId = currentPlayer === 1 ? 2 : 1;
    
    // Group capturing units by building to check if at least 1 survived
    const capturesByBuilding = new Map<string, string[]>();
    for (const unit of this.state.units.values()) {
      if (unit.owner === opponent && unit.capturingBuildingId) {
        const buildingId = unit.capturingBuildingId;
        if (!capturesByBuilding.has(buildingId)) {
          capturesByBuilding.set(buildingId, []);
        }
        capturesByBuilding.get(buildingId)!.push(unit.instanceId);
      }
    }
    
    // Process captures: if at least 1 capturing unit survived, building is captured
    for (const [buildingId, capturingUnitIds] of capturesByBuilding) {
      const units = this.state.units;
      const survivingCapture = capturingUnitIds.some(id => units.has(id));
      if (survivingCapture) {
        const building = this.state.buildings.get(buildingId);
        if (building) {
          const oldOwner = building.owner;
          building.owner = opponent;
          eventBus.emit('BUILDING_CAPTURED', { 
            buildingId: building.id, 
            newOwner: opponent,
            oldOwner 
          });
        }
      }
      
      // Clear capturingBuildingId from all units that were trying to capture this building
      for (const unitId of capturingUnitIds) {
        const unit = this.state.units.get(unitId);
        if (unit) {
          unit.capturingBuildingId = null;
        }
      }
    }

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
    const blockedTiles = getAdjacentBlockedTiles(unit, this.state, reachableTiles);
    
    this.state.movePreview = {
      reachableTiles,
      blockedTiles,
      path: [],
      destination: null,
    };

    eventBus.emit('MOVE_PREVIEW_SHOWN', { unitId, reachableTiles, blockedTiles });

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

    const definition = unitRegistry.get(unit.definitionId);
    if (!definition) return;

    const moveCost = getMovementCostTo(unit, destination, this.state);
    if (moveCost === null) return;

    // Check if unit has enough supply
    if (unit.supply < moveCost) {
      return;
    }

    // Check destination - cannot move onto building tiles (Wargroove-style: interact from adjacent)
    const destContent = this.state.map[destination.y]?.[destination.x]?.content;
    if (destContent?.type === 'building') {
      this.hideMovePreview();
      return;
    }

    const oldPosition = { ...unit.position };

    // Clear old position (units can't be on buildings, so no restoration needed)
    this.state.map[oldPosition.y][oldPosition.x].content = { type: 'empty' };

    // Consume supply for movement
    unit.supply -= moveCost;

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

    // Always go to UNIT_MOVED after moving - show action menu
    // Player chooses: Attack, Wait, or Cancel
    // Don't auto-show attack targets - that's done via menu option instead
    this.setPhase('UNIT_MOVED');
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
    const validPhases = ['UNIT_SELECTED', 'UNIT_MOVED'];
    if (!validPhases.includes(this.state.phase)) return;

    const unitId = this.state.selectedUnitId;
    if (!unitId) return;

    const unit = this.state.units.get(unitId);
    if (!unit) return;
    if (unit.hasActed) return;

    const definition = unitRegistry.get(unit.definitionId);
    if (!definition) return;

    // Get all valid targets in range (using either weapon)
    const targetUnits = getAllValidTargetsInRange(unit, unit.position, this.state);
    // Transform to event format
    const targets = targetUnits.map(u => ({ unitId: u.instanceId, position: u.position }));

    // If no targets in range, go back to IDLE (unit can still move/act elsewhere)
    if (targets.length === 0) {
      this.state.selectedUnitId = null;
      this.state.movePreview = null;
      this.state.attackPreview = null;
      this.setPhase('IDLE');
      return;
    }

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

    // Check fire-after-move capability:
    // - If special doesn't allow fire_after_move and doesn't have auxiliary, can't attack after moving
    // - If auxiliary allows fire_after_move, can attack after moving
    const canFireAfterMove = definition.weapons.auxiliary?.fire_after_move ||
      !definition.weapons.special?.fire_after_move ||
      unit.ammo <= 0;
    
    if (!canFireAfterMove) {
      this.setPhase('UNIT_SPENT');
      return;
    }

    // Get targets from new position (only weapons that allow fire_after_move)
    const targetUnits = getAllValidTargetsInRange(unit, position, this.state, true);
    const targets = targetUnits.map(u => ({ unitId: u.instanceId, position: u.position }));

    // If no targets in range, go to post-move action phase
    if (targets.length === 0) {
      this.state.attackPreview = null;
      this.setPhase('UNIT_MOVED');
      return;
    }

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
    if (this.state.phase === 'ACTION_PREVIEW_ATTACK_FROM_CURRENT') {
      this.setPhase('UNIT_SELECTED');
    } else if (this.state.phase === 'ACTION_PREVIEW_ATTACK_AFTER_MOVE') {
      this.setPhase('UNIT_MOVED');
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

    // Get best weapon using new selection logic (checks range + armor preference)
    const weapon = getBestWeaponForTarget(attacker, defender);
    if (!weapon) {
      this.setPhase('IDLE');
      return;
    }
    const usedSpecial = !!(weapon && definition.weapons.special && weapon === definition.weapons.special);
    const combatResult = this.resolveAttack(
      attacker,
      defender,
      weapon,
      attackPosition,
      usedSpecial
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
   * Execute capture action on a building.
   * Unit must be adjacent to a non-friendly building.
   * Capture completes at end of opponent's turn.
   */
  executeCapture(buildingId: string): void {
    if (!this.state) return;

    const validPhases = ['UNIT_SELECTED', 'UNIT_MOVED'];
    if (!validPhases.includes(this.state.phase)) return;

    const unitId = this.state.selectedUnitId;
    if (!unitId) return;

    const unit = this.state.units.get(unitId);
    if (!unit) return;

    const definition = unitRegistry.get(unit.definitionId);
    if (!definition || !definition.can_capture) return;

    if (unit.hasActed) return;

    const building = this.state.buildings.get(buildingId);
    if (!building) return;

    if (building.owner === unit.owner) return;

    const isAdjacent = 
      Math.abs(unit.position.x - building.position.x) + 
      Math.abs(unit.position.y - building.position.y) === 1;
    if (!isAdjacent) return;

    unit.capturingBuildingId = buildingId;
    unit.hasActed = true;

    this.state.selectedUnitId = null;
    this.state.movePreview = null;
    this.state.attackPreview = null;

    eventBus.emit('UNIT_CAPTURING', { unitId, buildingId });

    this.setPhase('UNIT_SPENT');
  }

  /**
   * Execute contest action to stop enemy from capturing a building.
   * - Apply 10% damage to each enemy capturing unit
   * - Apply 5% × number of enemy capturers damage to contester
   * - Clear capturingBuildingId from all enemy capturers
   */
  executeContest(buildingId: string): void {
    if (!this.state) return;

    const validPhases = ['UNIT_SELECTED', 'UNIT_MOVED'];
    if (!validPhases.includes(this.state.phase)) return;

    const unitId = this.state.selectedUnitId;
    if (!unitId) return;

    const unit = this.state.units.get(unitId);
    if (!unit) return;

    if (unit.hasActed) return;

    const building = this.state.buildings.get(buildingId);
    if (!building) return;

    const isAdjacent = 
      Math.abs(unit.position.x - building.position.x) + 
      Math.abs(unit.position.y - building.position.y) === 1;
    if (!isAdjacent) return;

    // Find all ENEMY units currently capturing this building
    const enemyCapturers = [...this.state.units.values()].filter(
      u => u.owner !== unit.owner && u.capturingBuildingId === buildingId
    );

    if (enemyCapturers.length === 0) return;

    // Apply 10% damage to each enemy capturer
    for (const enemy of enemyCapturers) {
      const damage = Math.floor(enemy.maxHp * 0.1);
      enemy.currentHp = Math.max(0, enemy.currentHp - damage);
      if (enemy.currentHp === 0) {
        this.removeUnit(enemy.instanceId);
      }
    }

    // Apply 5% × number of enemy capturers (max 15%) to contester
    const contesterDamage = Math.min(enemyCapturers.length * 5, 15);
    const actualDamage = Math.floor(unit.maxHp * (contesterDamage / 100));
    unit.currentHp = Math.max(0, unit.currentHp - actualDamage);
    if (unit.currentHp === 0) {
      this.removeUnit(unit.instanceId);
      this.setPhase('UNIT_SPENT');
      return;
    }

    // Clear capturingBuildingId from all enemy capturers
    for (const enemy of enemyCapturers) {
      const enemyUnit = this.state.units.get(enemy.instanceId);
      if (enemyUnit) {
        enemyUnit.capturingBuildingId = null;
      }
    }

    // Mark contester as having acted
    unit.hasActed = true;

    this.state.selectedUnitId = null;
    this.state.movePreview = null;
    this.state.attackPreview = null;

    eventBus.emit('UNIT_CONTESTED', { unitId, buildingId, enemiesCount: enemyCapturers.length });

    this.setPhase('UNIT_SPENT');
  }

  /**
   * Check if unit can capture any adjacent building.
   */
  canCapture(): boolean {
    if (!this.state) return false;

    const unitId = this.state.selectedUnitId;
    if (!unitId) return false;

    const unit = this.state.units.get(unitId);
    if (!unit) return false;

    const definition = unitRegistry.get(unit.definitionId);
    if (!definition || !definition.can_capture) return false;

    if (unit.hasActed) return false;

    for (const building of this.state.buildings.values()) {
      if (building.owner === unit.owner) continue;

      const isAdjacent = 
        Math.abs(unit.position.x - building.position.x) + 
        Math.abs(unit.position.y - building.position.y) === 1;
      if (isAdjacent) return true;
    }

    return false;
  }

  /**
   * Check if unit can contest an adjacent building being captured by enemy.
   */
  canContest(): boolean {
    if (!this.state) return false;

    const unitId = this.state.selectedUnitId;
    if (!unitId) return false;

    const unit = this.state.units.get(unitId);
    if (!unit) return false;

    if (unit.hasActed) return false;

    for (const building of this.state.buildings.values()) {
      const isAdjacent = 
        Math.abs(unit.position.x - building.position.x) + 
        Math.abs(unit.position.y - building.position.y) === 1;
      if (!isAdjacent) continue;

      // Check if enemy is capturing this building
      const enemyCapturing = [...this.state.units.values()].find(
        u => u.owner !== unit.owner && u.capturingBuildingId === building.id
      );
      if (enemyCapturing) return true;
    }

    return false;
  }

  /**
   * Core combat resolution logic.
   * 1. Calculate damage from attacker to defender
   * 2. Apply damage to defender
   * 3. If defender survives and can retaliate, calculate retaliation
   * 4. Consume ammo if special weapon was used
   * 5. Return combat result
   */
  private resolveAttack(
    attacker: Unit,
    defender: Unit,
    weapon: { damage_vs_armor: Record<string, number>; range_penalty_multiplier: number; min_range: number; max_range: number; uses_ammo: boolean },
    fromPosition: Position,
    usedSpecial: boolean
  ): CombatResult {
    // Calculate damage (attacker has first-strike bonus)
    const damageDealt = calculateDamage(attacker, defender, weapon as any, fromPosition, this.state!, false);

    // Apply damage to defender
    const defenderAfterDamage = Math.max(0, defender.currentHp - damageDealt);
    const defenderDestroyed = defenderAfterDamage <= 0;
    defender.currentHp = defenderAfterDamage;

    // Handle retaliation if defender survives
    let retaliationDamage: number | undefined;
    let attackerDestroyed: boolean | undefined;

    if (!defenderDestroyed && canRetaliate(defender, attacker, defender.position, this.state!)) {
      const retaliationWeapon = getBestRetaliationWeapon(defender, attacker, this.state!);
      if (retaliationWeapon) {
        retaliationDamage = calculateDamage(defender, attacker, retaliationWeapon, defender.position, this.state!, true);

        // Apply retaliation damage
        const attackerAfterRetaliation = Math.max(0, attacker.currentHp - retaliationDamage);
        attackerDestroyed = attackerAfterRetaliation <= 0;
        attacker.currentHp = attackerAfterRetaliation;
      }
    }

    // Consume ammo if special weapon was used
    if (usedSpecial && attacker.ammo > 0) {
      attacker.ammo--;
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

    // Check win condition
    this.checkWinCondition();
  }

  // ========================================================================
  // TURN MANAGEMENT
  // ========================================================================

  /** End the current unit's turn without further actions */
  endUnitTurn(): void {
    if (!this.state) return;
    
    const validPhases = ['UNIT_SELECTED', 'UNIT_MOVED', 'UNIT_SPENT'];
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

    console.log('checkWinCondition called', { player1Units, player2Units, winner: this.state.winner });

    // Check HQ destruction status (Wargroove-style: destroyed when HP = 0)
    for (const building of this.state.buildings.values()) {
      if (building.buildingType === 'hq') {
        if (building.hp <= 0 && building.owner === 1) {
          player1HqDestroyed = true; // Player 1's HQ destroyed
        }
        if (building.hp <= 0 && building.owner === 2) {
          player2HqDestroyed = true; // Player 2's HQ destroyed
        }
      }
    }

    // Check win conditions: lose if your HQ is destroyed
    if (player1HqDestroyed) {
      this.state.winner = 2;
      this.setPhase('GAME_OVER');
      eventBus.emit('GAME_OVER', { winner: 2 });
      return;
    }

    if (player2HqDestroyed) {
      this.state.winner = 1;
      this.setPhase('GAME_OVER');
      eventBus.emit('GAME_OVER', { winner: 1 });
      return;
    }

    if (player1Units === 0) {
      this.state.winner = 2;
      this.setPhase('GAME_OVER');
      eventBus.emit('GAME_OVER', { winner: 2 });
      return;
    }

    if (player2Units === 0) {
      this.state.winner = 1;
      this.setPhase('GAME_OVER');
      eventBus.emit('GAME_OVER', { winner: 1 });
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
    // Check buildings Map for a building at this position
    // (units overwrite tile content, so we can't rely on tile.content.type)
    for (const building of this.state!.buildings.values()) {
      if (building.position.x === position.x && building.position.y === position.y) {
        return building;
      }
    }
    return null;
  }

  /**
   * Preview combat damage without applying it.
   * Returns deterministic damage estimates for UI display.
   */
  previewCombat(attackerId: string, defenderId: string): CombatPreview | null {
    if (!this.state) return null;

    const attacker = this.state.units.get(attackerId);
    const defender = this.state.units.get(defenderId);
    
    if (!attacker || !defender) return null;

    const attackerDef = unitRegistry.get(attacker.definitionId);
    if (!attackerDef) return null;

    const weapon = getBestWeaponForTarget(attacker, defender);
    if (!weapon) return null;

    // Calculate attacker damage (with first-strike bonus)
    const attackerDamage = calculateDamage(
      attacker,
      defender,
      weapon,
      attacker.position,
      this.state,
      false
    );

    // Check if defender can retaliate (using defender's current HP)
    const defenderCanRetaliate = canRetaliate(defender, attacker, defender.position, this.state);

    let defenderRetaliation: number | null = null;

    if (defenderCanRetaliate) {
      const retaliationWeapon = getBestRetaliationWeapon(defender, attacker, this.state);
      if (retaliationWeapon) {
        // Create a copy of defender with reduced HP for retaliation calculation
        const defenderAfterHit: Unit = {
          ...defender,
          currentHp: Math.max(0, defender.currentHp - attackerDamage),
        };

        defenderRetaliation = calculateDamage(
          defenderAfterHit,
          attacker,
          retaliationWeapon,
          defender.position,
          this.state,
          true
        );
      }
    }

    // Determine if it's a poor trade (retaliation > attacker damage)
    const poorTrade = defenderRetaliation !== null && defenderRetaliation > attackerDamage;

    return {
      attackerDamage,
      defenderRetaliation,
      poorTrade,
    };
  }
}

// Export singleton instance
export const gameEngine = new GameEngine();

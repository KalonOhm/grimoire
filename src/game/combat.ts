// ============================================================================
// COMBAT SYSTEM - Damage calculation and combat resolution
// ============================================================================
// Implements the Advance Wars-style deterministic combat formula.
// All damage is calculated once with no randomness in the MVP.

import { Unit, Weapon, CombatResult, Position, ArmorClass, GameState } from './types';
import { unitRegistry, terrainRegistry } from './registry';

// ============================================================================
// UNIT EFFECTIVENESS CALCULATION
// ============================================================================

/**
 * Calculate how effective a unit is based on its current HP.
 * This is the "attacker effectiveness" multiplier in the damage formula.
 * 
 * LINEAR MODEL (infantry squads):
 * - Effectiveness scales linearly with HP fraction
 * - 100% HP = 1.0 effectiveness
 * - 50% HP = 0.5 effectiveness
 * 
 * STEPPED MODEL (single-model vehicles):
 * - Full effectiveness (1.0) until damaged_threshold
 * - Below threshold, effectiveness = hpFraction × damageMultiplier
 * - Example: 40% threshold, 0.5 damage multiplier
 *   - At 50% HP: still full effectiveness
 *   - At 30% HP: 0.3 × 0.5 = 0.15 effectiveness
 */
export function getUnitEffectiveness(unit: Unit): number {
  const definition = unitRegistry.get(unit.definitionId);
  if (!definition) return 0;

  // Calculate max HP from roster
  const maxHp = definition.roster.model_count * definition.roster.hp_per_model;
  const hpFraction = unit.currentHp / maxHp;

  // Linear model: direct scaling with HP
  if (definition.combat_model === 'linear') {
    return hpFraction;
  }

  // Stepped model: full effectiveness until threshold
  if (definition.combat_model === 'stepped') {
    if (!definition.damaged_threshold || !definition.damaged_effects) {
      return hpFraction; // Fallback to linear if not properly configured
    }

    // Threshold is stored as percentage (e.g., 40 = 40%)
    const threshold = definition.damaged_threshold / 100;
    
    // Above threshold = full effectiveness
    if (hpFraction > threshold) {
      return 1;
    }

    // Below threshold = apply damage penalty
    const damageMultiplier = definition.damaged_effects.damage_multiplier;
    return hpFraction * damageMultiplier;
  }

  // Fallback
  return hpFraction;
}

// ============================================================================
// RANGE AND TARGETING
// ============================================================================

/**
 * Check if a target is within weapon range.
 * Uses Manhattan distance (grid-based).
 * 
 * @param attackerPos - Position attacking FROM
 * @param defenderPos - Position attacking TO
 * @param weapon - Weapon being used
 * @returns true if defender is in range
 */
export function isInRange(
  attackerPos: Position,
  defenderPos: Position,
  weapon: Weapon
): boolean {
  // Manhattan distance: |x1-x2| + |y1-y2|
  const distance = Math.abs(attackerPos.x - defenderPos.x) + Math.abs(attackerPos.y - defenderPos.y);
  
  // Must be >= min_range AND <= max_range
  return distance >= weapon.min_range && distance <= weapon.max_range;
}

/**
 * Check if a weapon can target a specific defender.
 * Checks the damage_vs_armor lookup table.
 * 
 * @returns true if weapon can deal damage to this armor class
 */
export function canTarget(
  _attacker: Unit,      // Unused in current implementation
  defender: Unit,
  weapon: Weapon,
  _gameState: GameState // Unused in current implementation
): boolean {
  const defenderDef = unitRegistry.get(defender.definitionId);
  if (!defenderDef) return false;

  // Look up damage for defender's armor class
  const damageValue = weapon.damage_vs_armor[defenderDef.armor as ArmorClass];
  
  // -1 or undefined = cannot target
  return damageValue !== undefined && damageValue >= 0;
}

/**
 * Get all valid targets for a weapon from a position.
 * Filters by:
 * 1. Target is enemy
 * 2. Target is in range
 * 3. Weapon can target defender's armor class
 */
export function getValidTargets(
  attacker: Unit,
  weapon: Weapon,
  fromPosition: Position,
  gameState: GameState
): Unit[] {
  const targets: Unit[] = [];

  for (const unit of gameState.units.values()) {
    // Skip friendly units
    if (unit.owner === attacker.owner) continue;

    // Check range
    if (!isInRange(fromPosition, unit.position, weapon)) continue;

    // Check if weapon can target this armor class
    if (!canTarget(attacker, unit, weapon, gameState)) continue;

    targets.push(unit);
  }

  return targets;
}

// ============================================================================
// DAMAGE MODIFIERS
// ============================================================================

/**
 * Apply range penalty to damage.
 * Units attacking beyond range 1 take a damage penalty.
 * 
 * @example
 * Infantry bolter: range_penalty_multiplier = 0.6
 * - At range 1: no penalty
 * - At range 2: damage × 0.6
 */
function applyRangePenalty(
  baseDamage: number,
  attackerPos: Position,
  defenderPos: Position,
  weapon: Weapon
): number {
  const distance = Math.abs(attackerPos.x - defenderPos.x) + Math.abs(attackerPos.y - defenderPos.y);

  // No penalty at melee/close range
  if (distance <= 1) {
    return baseDamage;
  }

  // Apply penalty multiplier if weapon has one
  if (weapon.range_penalty_multiplier < 1) {
    return baseDamage * weapon.range_penalty_multiplier;
  }

  return baseDamage;
}

/**
 * Get terrain defense value at a position.
 * Defense reduces incoming damage as a percentage.
 * 
 * @example
 * Forest has defense: 30
 * Incoming damage: 50
 * Reduced damage: 50 × (1 - 0.30) = 35
 */
function getTerrainDefense(position: Position, gameState: GameState): number {
  const tile = gameState.map[position.y]?.[position.x];
  if (!tile) return 0;

  const terrain = terrainRegistry.get(tile.terrainId);
  if (!terrain) return 0;

  return terrain.defense;
}

// ============================================================================
// CORE DAMAGE CALCULATION
// ============================================================================

/**
 * Calculate damage using the Advance Wars formula:
 * 
 * finalDamage = floor(
 *   baseDamage × attackerEffectiveness × rangePenalty × terrainDefense
 * )
 * 
 * @param attacker - Unit dealing damage
 * @param defender - Unit receiving damage
 * @param weapon - Weapon being used
 * @param fromPosition - Position attacking FROM
 * @param gameState - Current game state (for terrain lookup)
 * @returns Final damage to apply
 */
export function calculateDamage(
  attacker: Unit,
  defender: Unit,
  weapon: Weapon,
  fromPosition: Position,
  gameState: GameState
): number {
  const defenderDef = unitRegistry.get(defender.definitionId);
  if (!defenderDef) return 0;

  // Step 1: Get base damage from weapon vs defender's armor class
  const armorClass = defenderDef.armor as ArmorClass;
  const baseDamage = weapon.damage_vs_armor[armorClass];

  // Invalid target (weapon can't target this armor)
  if (baseDamage === undefined || baseDamage < 0) return 0;

  // Step 2: Apply attacker effectiveness (HP-based scaling)
  const attackerEffectiveness = getUnitEffectiveness(attacker);
  let damage = baseDamage * attackerEffectiveness;

  // Step 3: Apply range penalty
  damage = applyRangePenalty(damage, fromPosition, defender.position, weapon);

  // Step 4: Apply terrain defense reduction
  const terrainDefense = getTerrainDefense(defender.position, gameState);
  const defenseReduction = terrainDefense / 100;
  damage = damage * (1 - defenseReduction);

  // Step 5: Floor to integer and enforce minimum
  const finalDamage = Math.floor(damage);

  // Minimum damage rule: at least 1 if any damage was calculated
  // This ensures weapons always "tick" damage, even to heavily defended targets
  if (finalDamage > 0 && finalDamage < 1) {
    return 1;
  }

  return finalDamage;
}

// ============================================================================
// RETALIATION
// ============================================================================

/**
 * Check if a defender can retaliate after being attacked.
 * Retaliation rules (reactive defense, not an "action"):
 * 1. Defender must have survived the attack
 * 2. Defender must have a weapon that can target attacker
 * 3. Attacker must be in weapon range
 * 4. Prefer secondary weapon (melee) over primary
 */
export function canRetaliate(
  defender: Unit,
  attacker: Unit,
  defenderPosition: Position,
  gameState: GameState
): boolean {
  const defenderDef = unitRegistry.get(defender.definitionId);
  if (!defenderDef) return false;

  // Get the retaliation weapon (prefer secondary/melee)
  const primaryWeapon = defenderDef.weapons.primary;
  const secondaryWeapon = defenderDef.weapons.secondary;

  // Check if secondary weapon can target and is in range
  if (secondaryWeapon && canTarget(defender, attacker, secondaryWeapon, gameState)) {
    if (isInRange(defenderPosition, attacker.position, secondaryWeapon)) {
      return true;
    }
  }

  // Check if primary weapon can target and is in range
  if (canTarget(defender, attacker, primaryWeapon, gameState)) {
    if (isInRange(defenderPosition, attacker.position, primaryWeapon)) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// COMBAT RESOLUTION
// ============================================================================

/**
 * Full combat resolution including retaliation.
 * 
 * Combat order:
 * 1. Attacker deals damage to defender
 * 2. If defender survives, defender retaliates
 * 3. Return detailed combat result
 */
export function resolveCombat(
  attacker: Unit,
  defender: Unit,
  weapon: Weapon,
  fromPosition: Position,
  gameState: GameState
): CombatResult {
  // Calculate initial attack damage
  const damageDealt = calculateDamage(attacker, defender, weapon, fromPosition, gameState);

  // Apply damage
  const defenderAfterDamage = Math.max(0, defender.currentHp - damageDealt);
  const defenderDestroyed = defenderAfterDamage <= 0;

  // Handle retaliation
  let retaliationDamage: number | undefined;
  let attackerDestroyed: boolean | undefined;

  if (!defenderDestroyed && canRetaliate(defender, attacker, defender.position, gameState)) {
    const defenderDef = unitRegistry.get(defender.definitionId);
    if (defenderDef) {
      // Use secondary if available (usually melee), otherwise primary
      const retaliationWeapon = defenderDef.weapons.secondary
        ? defenderDef.weapons.secondary
        : defenderDef.weapons.primary;

      // Defender retaliates using their current HP (after taking damage)
      const defenderAfterDamageUnit: Unit = {
        ...defender,
        currentHp: defenderAfterDamage,
      };

      // Calculate retaliation damage
      retaliationDamage = calculateDamage(
        defenderAfterDamageUnit,
        attacker,
        retaliationWeapon,
        defender.position,
        gameState
      );

      // Apply retaliation damage
      const attackerAfterRetaliation = Math.max(0, attacker.currentHp - retaliationDamage);
      attackerDestroyed = attackerAfterRetaliation <= 0;
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

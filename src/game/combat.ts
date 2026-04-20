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
  
  // DEBUG
  console.log('[DEBUG] canTarget check', {
    weapon: weapon.name,
    defenderArmor: defenderDef.armor,
    defenderId: defenderDef.id,
    damageValue,
  });
  
  // -1 or undefined = cannot target
  return damageValue !== undefined && damageValue >= 0;
}

/**
 * Get the best weapon for retaliation against a target.
 * Picks the weapon with higher damage against the target's armor class.
 */
export function getBestRetaliationWeapon(
  defender: Unit,
  target: Unit,
  _gameState: GameState
): Weapon | undefined {
  const defenderDef = unitRegistry.get(defender.definitionId);
  if (!defenderDef) return undefined;

  const targetDef = unitRegistry.get(target.definitionId);
  if (!targetDef) return undefined;

  const targetArmor = targetDef.armor as ArmorClass;
  const auxiliary = defenderDef.weapons.auxiliary;
  const special = defenderDef.weapons.special;

  const auxiliaryDamage = auxiliary?.damage_vs_armor[targetArmor] ?? -1;
  const specialDamage = special?.damage_vs_armor[targetArmor] ?? -1;

  // Get viable weapons (check range for BOTH)
  const auxiliaryViable = auxiliary && auxiliaryDamage >= 0 && 
      isInRange(defender.position, target.position, auxiliary);
  const specialViable = special && specialDamage >= 0 && defender.ammo > 0 && 
      isInRange(defender.position, target.position, special);

  // Infantry types → use auxiliary (conserve special ammo)
  const preferAuxiliary = targetArmor === 'light_infantry' || 
                       targetArmor === 'heavy_infantry' || 
                       targetArmor === 'mounted';
  
  if (preferAuxiliary && auxiliaryViable) {
    return auxiliary;
  }

  // Default priority: special first (if in range), then auxiliary
  if (specialViable) return special;
  if (auxiliaryViable) return auxiliary;

  return undefined;
}

/**
 * Get the best weapon to attack a specific target.
 * Returns the weapon with highest damage vs target's armor.
 */
export function getBestWeaponForTarget(
  attacker: Unit,
  target: Unit
): Weapon | undefined {
  const attackerDef = unitRegistry.get(attacker.definitionId);
  if (!attackerDef) return undefined;

  const targetDef = unitRegistry.get(target.definitionId);
  if (!targetDef) return undefined;

  const targetArmor = targetDef.armor as ArmorClass;
  const auxiliary = attackerDef.weapons.auxiliary;
  const special = attackerDef.weapons.special;

  const auxiliaryDamage = auxiliary?.damage_vs_armor[targetArmor] ?? -1;
  const specialDamage = special?.damage_vs_armor[targetArmor] ?? -1;

  // Get viable weapons (check range for BOTH)
  const auxiliaryViable = auxiliary && auxiliaryDamage >= 0 && 
      isInRange(attacker.position, target.position, auxiliary);
  const specialViable = special && specialDamage >= 0 && attacker.ammo > 0 && 
      isInRange(attacker.position, target.position, special);

  // Infantry types → use auxiliary (conserve special ammo)
  const preferAuxiliary = targetArmor === 'light_infantry' || 
                       targetArmor === 'heavy_infantry' || 
                       targetArmor === 'mounted';
  
  if (preferAuxiliary && auxiliaryViable) {
    return auxiliary;
  }

  // Default priority: special first (if in range), then auxiliary
  if (specialViable) return special;
  if (auxiliaryViable) return auxiliary;

  return undefined;
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
  
  // DEBUG
  const allEnemyUnits: any[] = [];
  for (const unit of gameState.units.values()) {
    if (unit.owner === attacker.owner) continue;
    allEnemyUnits.push({ id: unit.definitionId, pos: unit.position, owner: unit.owner });
  }
  console.log('[DEBUG] getValidTargets', { 
    weaponName: weapon.name, 
    weaponRange: [weapon.min_range, weapon.max_range],
    fromPosition,
    enemyUnits: allEnemyUnits
  });

  for (const unit of gameState.units.values()) {
    // Skip own units
    if (unit.owner === attacker.owner) continue;
    
    // Check if can target this armor class
    if (!canTarget(attacker, unit, weapon, gameState)) {
      console.log('[DEBUG] canTarget FALSE for', unit.definitionId);
      continue;
    }
    
    // Check if in range
    const distance = Math.abs(fromPosition.x - unit.position.x) + Math.abs(fromPosition.y - unit.position.y);
    if (!isInRange(fromPosition, unit.position, weapon)) {
      console.log('[DEBUG] NOT IN RANGE:', unit.definitionId, 'distance:', distance, 'range:', [weapon.min_range, weapon.max_range]);
      continue;
    }
    
    console.log('[DEBUG] ADDING TARGET:', unit.definitionId);
    targets.push(unit);
  }
  
  return targets;
}

/**
 * Get all valid targets using either primary or secondary weapon.
 * Returns units that can be attacked with either weapon.
 */
export function getAllValidTargetsInRange(
  attacker: Unit,
  fromPosition: Position,
  gameState: GameState
): Unit[] {
  const attackerDef = unitRegistry.get(attacker.definitionId);
  if (!attackerDef) return [];

  const auxiliary = attackerDef.weapons.auxiliary;
  const special = attackerDef.weapons.special;

  // DEBUG
  console.log('[DEBUG] getAllValidTargetsInRange', {
    attackerDef: attackerDef.id,
    fromPosition,
    ammo: attacker.ammo,
    hasAux: !!auxiliary,
    hasSpecial: !!special,
  });

  // Get targets for auxiliary weapon (always checked - even without ammo)
  const auxiliaryTargets = auxiliary 
    ? getValidTargets(attacker, auxiliary, fromPosition, gameState) 
    : [];

  console.log('[DEBUG] auxiliaryTargets:', auxiliaryTargets.map(u => ({ id: u.definitionId, pos: u.position })));

  // Get targets for special weapon (only if has ammo)
  const specialTargets = (special && attacker.ammo > 0) 
    ? getValidTargets(attacker, special, fromPosition, gameState) 
    : [];

  console.log('[DEBUG] specialTargets:', specialTargets.map(u => ({ id: u.definitionId, pos: u.position })));

  // Combine: first add all auxiliary targets, then add special targets ONLY if not already in range
  // This ensures auxiliary-attackable targets are never excluded
  const allTargets: Unit[] = [...auxiliaryTargets];
  
  for (const unit of specialTargets) {
    if (!allTargets.find(t => t.instanceId === unit.instanceId)) {
      allTargets.push(unit);
    }
  }

  console.log('[DEBUG] combined allTargets:', allTargets.map(u => ({ id: u.definitionId, pos: u.position })));

  return allTargets;
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
  gameState: GameState,
  _isRetaliation: boolean = false
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

  // Get the retaliation weapon
  const auxiliaryWeapon = defenderDef.weapons.auxiliary;
  const specialWeapon = defenderDef.weapons.special;

  // Check if special weapon can target and is in range
  if (specialWeapon && defender.ammo > 0 && canTarget(defender, attacker, specialWeapon, gameState)) {
    if (isInRange(defenderPosition, attacker.position, specialWeapon)) {
      return true;
    }
  }

  // Check if auxiliary weapon can target and is in range
  if (canTarget(defender, attacker, auxiliaryWeapon, gameState)) {
    if (isInRange(defenderPosition, attacker.position, auxiliaryWeapon)) {
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
      // Prefer special if has ammo, otherwise auxiliary
      const retaliationWeapon = defenderDef.weapons.special && defender.ammo > 0
        ? defenderDef.weapons.special
        : defenderDef.weapons.auxiliary;

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

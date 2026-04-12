import { Unit, Weapon, CombatResult, Position, ArmorClass, GameState } from './types';
import { unitRegistry, terrainRegistry } from './registry';

export function getUnitEffectiveness(unit: Unit): number {
  const definition = unitRegistry.get(unit.definitionId);
  if (!definition) return 0;

  const maxHp = definition.roster.model_count * definition.roster.hp_per_model;
  const hpFraction = unit.currentHp / maxHp;

  if (definition.combat_model === 'linear') {
    return hpFraction;
  }

  if (definition.combat_model === 'stepped') {
    if (!definition.damaged_threshold || !definition.damaged_effects) {
      return hpFraction;
    }

    const threshold = definition.damaged_threshold / 100;
    if (hpFraction > threshold) {
      return 1;
    }

    const damageMultiplier = definition.damaged_effects.damage_multiplier;
    return hpFraction * damageMultiplier;
  }

  return hpFraction;
}

export function isInRange(
  attackerPos: Position,
  defenderPos: Position,
  weapon: Weapon
): boolean {
  const distance = Math.abs(attackerPos.x - defenderPos.x) + Math.abs(attackerPos.y - defenderPos.y);
  return distance >= weapon.min_range && distance <= weapon.max_range;
}

export function canTarget(
  _attacker: Unit,
  defender: Unit,
  weapon: Weapon,
  _gameState: GameState
): boolean {
  const defenderDef = unitRegistry.get(defender.definitionId);
  if (!defenderDef) return false;

  const damageValue = weapon.damage_vs_armor[defenderDef.armor as ArmorClass];
  return damageValue !== undefined && damageValue >= 0;
}

export function getValidTargets(
  attacker: Unit,
  weapon: Weapon,
  fromPosition: Position,
  gameState: GameState
): Unit[] {
  const targets: Unit[] = [];

  for (const unit of gameState.units.values()) {
    if (unit.owner === attacker.owner) continue;

    if (!isInRange(fromPosition, unit.position, weapon)) continue;

    if (!canTarget(attacker, unit, weapon, gameState)) continue;

    targets.push(unit);
  }

  return targets;
}

function applyRangePenalty(
  baseDamage: number,
  attackerPos: Position,
  defenderPos: Position,
  weapon: Weapon
): number {
  const distance = Math.abs(attackerPos.x - defenderPos.x) + Math.abs(attackerPos.y - defenderPos.y);

  if (distance <= 1) {
    return baseDamage;
  }

  if (weapon.range_penalty_multiplier < 1) {
    return baseDamage * weapon.range_penalty_multiplier;
  }

  return baseDamage;
}

function getTerrainDefense(position: Position, gameState: GameState): number {
  const tile = gameState.map[position.y]?.[position.x];
  if (!tile) return 0;

  const terrain = terrainRegistry.get(tile.terrainId);
  if (!terrain) return 0;

  return terrain.defense;
}

export function calculateDamage(
  attacker: Unit,
  defender: Unit,
  weapon: Weapon,
  fromPosition: Position,
  gameState: GameState
): number {
  const defenderDef = unitRegistry.get(defender.definitionId);
  if (!defenderDef) return 0;

  const armorClass = defenderDef.armor as ArmorClass;
  const baseDamage = weapon.damage_vs_armor[armorClass];

  if (baseDamage === undefined || baseDamage < 0) return 0;

  const attackerEffectiveness = getUnitEffectiveness(attacker);
  let damage = baseDamage * attackerEffectiveness;

  damage = applyRangePenalty(damage, fromPosition, defender.position, weapon);

  const terrainDefense = getTerrainDefense(defender.position, gameState);
  const defenseReduction = terrainDefense / 100;
  damage = damage * (1 - defenseReduction);

  const finalDamage = Math.floor(damage);

  if (finalDamage > 0 && finalDamage < 1) {
    return 1;
  }

  return finalDamage;
}

export function canRetaliate(
  defender: Unit,
  attacker: Unit,
  defenderPosition: Position,
  gameState: GameState
): boolean {
  const defenderDef = unitRegistry.get(defender.definitionId);
  if (!defenderDef) return false;

  if (defender.hasActed) return false;

  const primaryWeapon = defenderDef.weapons.primary;

  if (!canTarget(defender, attacker, primaryWeapon, gameState)) {
    if (defenderDef.weapons.secondary) {
      const secondaryWeapon = defenderDef.weapons.secondary;
      if (canTarget(defender, attacker, secondaryWeapon, gameState)) {
        if (!isInRange(defenderPosition, attacker.position, secondaryWeapon)) {
          return false;
        }
        return true;
      }
    }
    return false;
  }

  if (!isInRange(defenderPosition, attacker.position, primaryWeapon)) {
    if (defenderDef.weapons.secondary) {
      const secondaryWeapon = defenderDef.weapons.secondary;
      if (canTarget(defender, attacker, secondaryWeapon, gameState)) {
        if (!isInRange(defenderPosition, attacker.position, secondaryWeapon)) {
          return false;
        }
        return true;
      }
    }
    return false;
  }

  return true;
}

export function resolveCombat(
  attacker: Unit,
  defender: Unit,
  weapon: Weapon,
  fromPosition: Position,
  gameState: GameState
): CombatResult {
  const damageDealt = calculateDamage(attacker, defender, weapon, fromPosition, gameState);

  const defenderAfterDamage = Math.max(0, defender.currentHp - damageDealt);
  const defenderDestroyed = defenderAfterDamage <= 0;

  let retaliationDamage: number | undefined;
  let attackerDestroyed: boolean | undefined;

  if (!defenderDestroyed && canRetaliate(defender, attacker, defender.position, gameState)) {
    const defenderDef = unitRegistry.get(defender.definitionId);
    if (defenderDef) {
      const retaliationWeapon = defenderDef.weapons.secondary
        ? defenderDef.weapons.secondary
        : defenderDef.weapons.primary;

      const defenderAfterDamageUnit: Unit = {
        ...defender,
        currentHp: defenderAfterDamage,
      };

      retaliationDamage = calculateDamage(defenderAfterDamageUnit, attacker, retaliationWeapon, defender.position, gameState);

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

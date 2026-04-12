import { UnitDefinition, TerrainType, MapData, ArmorClass } from './types';

class Registry<T extends { id: string }> {
  private items: Map<string, T> = new Map();

  register(item: T): void {
    this.items.set(item.id, item);
  }

  get(id: string): T | undefined {
    return this.items.get(id);
  }

  getAll(): T[] {
    return Array.from(this.items.values());
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  clear(): void {
    this.items.clear();
  }
}

export const unitRegistry = new Registry<UnitDefinition>();
export const terrainRegistry = new Registry<TerrainType>();
export const mapRegistry = new Registry<MapData>();
export const armorClassRegistry = new Registry<{ id: ArmorClass; name: string }>();

export const ARMOR_CLASSES: ArmorClass[] = [
  'light_infantry',
  'heavy_infantry',
  'super_heavy_infantry',
  'mounted',
  'light_vehicle',
  'medium_vehicle',
  'heavy_vehicle',
  'fortification',
  'aircraft',
];

export function initializeArmorClasses(): void {
  ARMOR_CLASSES.forEach((ac) => {
    armorClassRegistry.register({ id: ac, name: ac.replace(/_/g, ' ') });
  });
}

export function validateUnitDefinition(def: UnitDefinition): string[] {
  const errors: string[] = [];

  if (!def.id) errors.push('Unit definition missing id');
  if (!def.name) errors.push(`Unit ${def.id}: missing name`);
  if (!def.faction) errors.push(`Unit ${def.id}: missing faction`);
  if (!def.armor) errors.push(`Unit ${def.id}: missing armor class`);
  else if (!ARMOR_CLASSES.includes(def.armor)) {
    errors.push(`Unit ${def.id}: unknown armor class "${def.armor}"`);
  }

  if (def.roster.model_count < 1) {
    errors.push(`Unit ${def.id}: model_count must be at least 1`);
  }
  if (def.roster.hp_per_model < 1) {
    errors.push(`Unit ${def.id}: hp_per_model must be at least 1`);
  }

  if (def.combat_model === 'stepped') {
    if (!def.damaged_threshold) {
      errors.push(`Unit ${def.id}: stepped combat_model requires damaged_threshold`);
    }
    if (!def.damaged_effects) {
      errors.push(`Unit ${def.id}: stepped combat_model requires damaged_effects`);
    }
  }

  for (const [armor, damage] of Object.entries(def.weapons.primary.damage_vs_armor)) {
    if (damage === -1) continue;
    if (typeof damage !== 'number' || damage < 0) {
      errors.push(`Unit ${def.id}: invalid damage_vs_armor value for ${armor}`);
    }
  }

  return errors;
}

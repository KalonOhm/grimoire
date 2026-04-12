export type PlayerId = 1 | 2;

export type UnitId = string;

export type TileX = number;
export type TileY = number;

export interface Position {
  x: TileX;
  y: TileY;
}

export type MovementType = 'infantry' | 'tread' | 'tire' | 'fly' | 'mount';

export type ArmorClass =
  | 'light_infantry'
  | 'heavy_infantry'
  | 'super_heavy_infantry'
  | 'mounted'
  | 'light_vehicle'
  | 'medium_vehicle'
  | 'heavy_vehicle'
  | 'fortification'
  | 'aircraft';

export type UnitCategory = 'infantry' | 'vehicle' | 'aircraft';

export type CombatModel = 'linear' | 'stepped';

export interface Roster {
  model_count: number;
  hp_per_model: number;
}

export interface DamagedEffects {
  damage_multiplier: number;
  movement_modifier: number;
}

export interface Weapon {
  name: string;
  uses_ammo: boolean;
  min_range: number;
  max_range: number;
  fire_after_move: boolean;
  range_penalty_multiplier: number;
  damage_vs_armor: Partial<Record<ArmorClass, number>>;
}

export interface UnitDefinition {
  id: string;
  name: string;
  faction: string;
  category: UnitCategory;
  cost: number;
  roster: Roster;
  combat_model: CombatModel;
  damaged_threshold?: number;
  damaged_effects?: DamagedEffects;
  armor: ArmorClass;
  movement: {
    points: number;
    type: MovementType;
  };
  vision: number;
  fuel: number;
  ammo: number;
  can_capture: boolean;
  transport_tags_allowed: string[];
  weapons: {
    primary: Weapon;
    secondary?: Weapon;
  };
  sprite: string;
}

export interface Unit {
  instanceId: string;
  definitionId: string;
  owner: PlayerId;
  position: Position;
  currentHp: number;
  maxHp: number;
  hasMoved: boolean;
  hasActed: boolean;
  fuel: number;
  ammo: number;
  captureProgress: number;
}

export type TerrainId =
  | 'plains'
  | 'forest'
  | 'mountain'
  | 'road'
  | 'river'
  | 'bridge'
  | 'hq'
  | 'factory'
  | 'city'
  | 'water'
  | 'impassable';

export interface TerrainType {
  id: TerrainId;
  name: string;
  defense: number;
  movement_cost: Partial<Record<MovementType, number>>;
  blocks_movement: boolean;
  can_capture: boolean;
  income_per_turn: number;
}

export interface Building {
  id: string;
  terrainId: TerrainId;
  position: Position;
  owner: PlayerId | null;
  captureProgress: number;
}

export type TileContent =
  | { type: 'empty' }
  | { type: 'unit'; unitId: string }
  | { type: 'building'; buildingId: string };

export interface Tile {
  x: TileX;
  y: TileY;
  terrainId: TerrainId;
  content: TileContent;
}

export interface MapData {
  id: string;
  name: string;
  width: number;
  height: number;
  terrain: TerrainId[][];
  units: Array<{
    definitionId: string;
    owner: PlayerId;
    position: Position;
  }>;
  buildings: Array<{
    terrainId: TerrainId;
    position: Position;
  }>;
}

export type GamePhase =
  | 'BOOT'
  | 'TURN_START'
  | 'IDLE'
  | 'UNIT_SELECTED'
  | 'ACTION_PREVIEW_MOVE'
  | 'ACTION_PREVIEW_ATTACK_FROM_CURRENT'
  | 'ACTION_PREVIEW_ATTACK_AFTER_MOVE'
  | 'ACTION_PREVIEW_CAPTURE'
  | 'ACTION_PREVIEW_LOAD'
  | 'ACTION_PREVIEW_UNLOAD'
  | 'ACTION_PREVIEW_MERGE'
  | 'ACTION_CONFIRM'
  | 'UNIT_ACTION_RESOLVE'
  | 'UNIT_SPENT'
  | 'TURN_END'
  | 'GAME_OVER'
  | 'BUILDING_SELECTED'
  | 'ACTION_PREVIEW_BUILD'
  | 'ACTION_CONFIRM_BUILD'
  | 'BUILDING_ACTION_RESOLVE';

export interface GameState {
  phase: GamePhase;
  activePlayer: PlayerId;
  currentTurn: number;
  players: {
    1: { credits: number };
    2: { credits: number };
  };
  units: Map<string, Unit>;
  buildings: Map<string, Building>;
  map: Tile[][];
  selectedUnitId: string | null;
  selectedBuildingId: string | null;
  movePreview: {
    reachableTiles: Position[];
    path: Position[];
    destination: Position | null;
  } | null;
  attackPreview: {
    targets: Array<{ unitId: string; position: Position }>;
  } | null;
  winner: PlayerId | null;
}

export interface ActionContext {
  unitId: string;
  fromPosition: Position;
  toPosition?: Position;
  targetUnitId?: string;
  weaponName?: string;
}

export interface CombatResult {
  attackerId: string;
  defenderId: string;
  damageDealt: number;
  defenderDestroyed: boolean;
  retaliationDamage?: number;
  attackerDestroyed?: boolean;
}

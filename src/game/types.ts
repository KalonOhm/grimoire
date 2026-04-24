// ============================================================================
// CORE TYPE DEFINITIONS FOR GRIMWARS
// ============================================================================
// This file defines all the fundamental types used throughout the game.
// These types are framework-agnostic and can be used by any rendering layer.

// Type aliases for semantic clarity
export type PlayerId = 1 | 2;          // Only 2 players in MVP
export type UnitId = string;           // Unique instance ID assigned at creation
export type TileX = number;           // Grid coordinate X
export type TileY = number;           // Grid coordinate Y

// Position on the game grid
export interface Position {
  x: TileX;
  y: TileY;
}

// ============================================================================
// MOVEMENT SYSTEM TYPES
// ============================================================================
// Movement type determines how a unit interacts with terrain costs.
// Each type has different movement costs for each terrain type.
export type MovementType =
  | 'foot'       // Standard foot movement
  | 'tread'      // Tanks, heavy vehicles
  | 'tire'       // Wheeled vehicles
  | 'fly'        // Aircraft (high altitude, can hover, fuel consumption)
  | 'hover'      // Jump packs, jetbikes, repulsorlift
  | 'mech'       // Walkers (slow, steady, terrain ignore)
  | 'naval'      // Sea units (future)
  | 'mount';     // Mounted cavalry (future)

// ============================================================================
// ARMOR CLASS SYSTEM
// ============================================================================
// Armor classes replace per-unit damage tables for better extensibility.
// When unit A attacks unit B, we look up: A.weapon.damage_vs_armor[B.armor]
// Adding a new unit only requires defining its armor class - no edits to other units.
export type ArmorClass =
  | 'light_infantry'        // Guardsmen, Cultists
  | 'heavy_infantry'        // Intercessors, Ork Boyz  
  | 'super_heavy_infantry' // Terminators, Meganobz
  | 'mounted'               // Outriders, Windriders
  | 'light_vehicle'         // Land Speeders, Sentinels
  | 'medium_vehicle'        // Rhinos, Dreadnoughts, Chimeras
  | 'heavy_vehicle'         // Land Raiders, Predators, Leman Russ
  | 'fortification'         // Buildings, Bunkers, HQs
  | 'aircraft';             // Stormravens, Dakkajets

// ============================================================================
// UNIT TYPES
// ============================================================================

// Category determines movement blocking rules and visuals
// - infantry: Can pass through friendlies, enter ruins
// - mounted: Can pass through friendlies, enter ruins (cavalry, bikes, jetbikes)
// - vehicle: Blocked by vehicles/monsters, cannot enter ruins
// - monster: Blocked by vehicles/monsters, cannot enter ruins
// - aircraft: Pass over all except enemy aircraft
export type UnitCategory = 'infantry' | 'mounted' | 'vehicle' | 'monster' | 'aircraft';

// Combat model determines how damage affects unit effectiveness
// - 'linear': Effectiveness scales with HP fraction (infantry squads)
// - 'stepped': Full effectiveness until threshold, then degraded (vehicles)
export type CombatModel = 'linear' | 'stepped';

// Roster system: visible models are derived, not hardcoded
// Intercessor: 5 models × 20 HP = 100 total HP, shows 5 sprites at full HP
// Land Raider: 1 model × 120 HP = 120 total HP, shows 1 sprite always
export interface Roster {
  model_count: number;   // How many models in the unit
  hp_per_model: number;  // HP per model for display calculations
}

// Effects applied when a 'stepped' combat model unit drops below threshold
export interface DamagedEffects {
  damage_multiplier: number;  // e.g., 0.5 = half damage output
  movement_modifier: number; // e.g., -2 = reduced movement points
}

// Weapon definition with all combat parameters
// Damage is looked up by defender's armor class, not defender's unit type
export interface Weapon {
  name: string;                          // Display name
  uses_ammo: boolean;                   // Whether weapon consumes ammo
  min_range: number;                    // Minimum attack range (1 = melee)
  max_range: number;                    // Maximum attack range
  fire_after_move: boolean;             // Can shoot after moving (artillery cannot)
  range_penalty_multiplier: number;     // Damage multiplier beyond range 1
  // Lookup table: damage vs each armor class
  // -1 or undefined = cannot target this armor class
  damage_vs_armor: Partial<Record<ArmorClass, number>>;
}

// Complete unit definition loaded from JSON
// This is the TEMPLATE from which actual unit instances are created
export interface UnitDefinition {
  id: string;                           // Unique ID (e.g., "intercessor_squad")
  name: string;                         // Display name
  faction: string;                       // e.g., "space_marines"
  category: UnitCategory;               // For organization/rendering hints
  cost: number;                         // Resources to purchase
  
  // Roster determines visible models and total HP
  roster: Roster;
  
  // Combat model: linear (multi-model) or stepped (vehicles)
  combat_model: CombatModel;
  damaged_threshold?: number;           // % HP threshold for stepped models
  damaged_effects?: DamagedEffects;     // Effects when below threshold
  
  // Armor class for damage lookup
  armor: ArmorClass;
  
  // Movement parameters
  movement: {
    points: number;  // Movement points available
    type: MovementType;  // Movement type for terrain cost lookup
  };
  
  vision: number;  // How far unit can see (for fog of war - future)
  supply: number;  // Movement supply (rations for infantry, fuel for vehicles/air)
  ammo: number;   // Weapon ammo for special weapon
  
  can_capture: boolean;  // Can capture buildings
  
  // Transport system uses tags, not hardcoded IDs
  // Unit can be loaded into transports with matching tags
  transport_tags_allowed: string[];
  
  weapons: {
    auxiliary: Weapon;   // Required - infinite ammo, typically melee/sidearm
    special?: Weapon;    // Optional - uses ammo, typically ranged/main weapon
  };
  
  sprite: string;  // Sprite key for rendering
}

// Runtime unit instance - created from UnitDefinition
// Contains current state that changes during gameplay
export interface Unit {
  instanceId: string;   // Unique ID assigned at creation
  definitionId: string; // Reference to UnitDefinition.id
  
  owner: PlayerId;      // Which player controls this unit
  position: Position;   // Current grid position
  
  // HP stored at high resolution (e.g., 0-100) separate from display
  // Display HP = currentHp / hp_per_model
  currentHp: number;
  maxHp: number;
  
  // Turn state flags
  hasMoved: boolean;  // Can still move this turn
  hasActed: boolean; // Can still act this turn
  
  supply: number;      // Remaining movement supply
  ammo: number;       // Remaining ammo for special weapon
  
  captureProgress: number; // 0-100 progress on current capture
  capturingBuildingId: string | null; // Building currently being captured
}

// ============================================================================
// TERRAIN SYSTEM
// ============================================================================

// Terrain ID used in map data
export type TerrainId =
  | 'plains' | 'forest' | 'mountain' | 'road' | 'river' | 'bridge'
  | 'ruins' | 'water' | 'impassable' | 'wasteland' | 'ash_wastes' | 'barrens' | 'stronghold';

// Terrain type definition with all gameplay effects
export interface TerrainType {
  id: TerrainId;
  name: string;
  
  // Defense reduces incoming damage (percentage)
  // e.g., 30 = incoming damage reduced by 30%
  defense: number;
  
  // Movement cost per movement type
  // Negative or undefined = impassable for that type
  // e.g., forest: { infantry: 1, tread: 2 }
  movement_cost: Partial<Record<MovementType, number>>;
  
  blocks_movement: boolean;  // Always impassable (water, mountains)
}

// Wargroove-style building (HQ, factory, city) - separate entity with HP
export type BuildingType = 'hq' | 'factory' | 'city';

export interface Building {
  id: string;
  buildingType: BuildingType;
  position: Position;
  owner: PlayerId | null;  // null = neutral
  maxHp: number;
  hp: number;
}

// ============================================================================
// MAP AND TILE SYSTEM
// ============================================================================

// Discriminated union for tile content
// TypeScript's pattern matching ensures we handle all cases
export type TileContent =
  | { type: 'empty' }                           // No content
  | { type: 'unit'; unitId: string }            // Unit on tile
  | { type: 'building'; buildingId: string };   // Building on tile

// Single tile on the map
export interface Tile {
  x: TileX;
  y: TileY;
  terrainId: TerrainId;  // Base terrain type
  content: TileContent;     // Current occupant
}

// Complete map data loaded from JSON
export interface MapData {
  id: string;
  name: string;
  width: number;
  height: number;
  fogOfWar?: boolean; // Optional flag to enable Fog of War for this map
  
  // 2D array of terrain IDs
  terrain: TerrainId[][];
  
  // Initial unit placements (before game starts)
  units: Array<{
    definitionId: string;  // Reference to UnitDefinition.id
    owner: PlayerId;
    position: Position;
  }>;
  
  // Initial building placements
  buildings: Array<{
    buildingType: BuildingType;
    position: Position;
  }>;
}

// ============================================================================
// STATE MACHINE
// ============================================================================
// All game states. UI interprets input based on current state.
// No hidden state inference - everything is explicit.

// Global game states
export type GamePhase =
  | 'BOOT'                                   // Loading assets and data
  | 'TURN_START'                             // Start of turn processing
  | 'IDLE'                                   // No selection, waiting for input
  | 'UNIT_SELECTED'                          // Unit selected, showing actions
  | 'UNIT_MOVED'                             // Unit has moved, showing post-move actions
  | 'ACTION_PREVIEW_MOVE'                    // Showing movement range
  | 'ACTION_PREVIEW_ATTACK_FROM_CURRENT'    // Showing attack targets from current position
  | 'ACTION_PREVIEW_ATTACK_AFTER_MOVE'      // Showing attack targets from destination
  | 'ACTION_PREVIEW_CAPTURE'                 // Showing capture target
  | 'ACTION_PREVIEW_LOAD'                    // Showing valid transports
  | 'ACTION_PREVIEW_UNLOAD'                  // Showing valid unload tiles
  | 'ACTION_PREVIEW_MERGE'                   // Showing valid merge targets
  | 'ACTION_CONFIRM'                         // Awaiting confirmation
  | 'UNIT_ACTION_RESOLVE'                    // Animating and applying action
  | 'UNIT_SPENT'                             // Unit finished acting
  | 'TURN_END'                               // Processing end of turn
  | 'GAME_OVER'                              // Game ended, winner declared
  // Building interaction branch
  | 'BUILDING_SELECTED'                      // Building selected, showing actions
  | 'ACTION_PREVIEW_BUILD'                   // Showing unit production menu
  | 'ACTION_CONFIRM_BUILD'                   // Confirming unit purchase
  | 'BUILDING_ACTION_RESOLVE';               // Creating purchased unit

// Complete game state
export interface GameState {
  // Current state machine phase
  phase: GamePhase;
  
  // Turn management
  activePlayer: PlayerId;   // Whose turn it is
  currentTurn: number;      // Current turn number
  
  // Fog of War
  fogOfWar: boolean;
  visibleTiles: Set<string>; // Set of "x,y" keys that the active player can see
  
  // Player resources
  players: {
    1: { resources: number };
    2: { resources: number };
  };
  
  // Game entities
  units: Map<string, Unit>;      // All units by instance ID
  buildings: Map<string, Building>; // All buildings by ID
  map: Tile[][];                 // 2D tile array
  
  // Selection state
  selectedUnitId: string | null;
  selectedBuildingId: string | null;
  
  // Preview state (for highlighting)
  movePreview: {
    reachableTiles: Position[];  // Tiles unit can reach
    blockedTiles: Position[];  // Tiles blocked but adjacent to reachable
    path: Position[];           // Path to selected destination
    destination: Position | null; // Selected destination
  } | null;
  
  attackPreview: {
    targets: Array<{ unitId: string; position: Position }>;
  } | null;
  
  // Win condition
  winner: PlayerId | null;
}

// Context for action resolution
export interface ActionContext {
  unitId: string;
  fromPosition: Position;
  toPosition?: Position;
  targetUnitId?: string;
  weaponName?: string;
}

// Result of combat resolution
export interface CombatResult {
  attackerId: string;
  defenderId: string;
  damageDealt: number;
  defenderDestroyed: boolean;
  retaliationDamage?: number;
  attackerDestroyed?: boolean;
}

// Preview of combat without applying damage (for UI display)
export interface CombatPreview {
  attackerDamage: number;      // Damage attacker will deal
  defenderRetaliation: number | null;  // Damage defender will retaliate, or null if no retaliation
  poorTrade: boolean;         // True if retaliation > attacker damage
}

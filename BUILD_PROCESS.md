# GrimWars: Dark Future - Build Process Documentation

## Overview

This document explains the step-by-step process of building the GrimWars MVP from scratch, the architectural decisions made, and the reasoning behind each choice. This serves as both a learning resource and a reference for future development.

---

## Phase 1: Project Setup

### Step 1.1: Environment Preparation

**What I did:**
1. Checked system environment (Windows, had npm issues initially)
2. Installed Node.js LTS via winget package manager

**Why:**
- TypeScript and npm are essential for React + Vite + TypeScript projects
- Node.js provides the runtime and package management needed
- winget is a modern Windows package manager that handles dependencies cleanly

### Step 1.2: Directory Creation

**What I did:**
```
Created C:\Users\kalon\Documents\grimwars\
├── src/
│   ├── game/           # Framework-agnostic game logic
│   ├── components/     # React UI components
│   └── phaser/        # Phaser-specific rendering
├── data/
│   ├── units/          # Unit JSON definitions
│   ├── terrain/        # Terrain type definitions
│   └── maps/           # Map data files
└── public/            # Static assets served directly
```

**Why:**
- Separating `src/game/` from `src/phaser/` enforces the architectural principle that game logic must be framework-agnostic
- `data/` directory follows the data-driven design - adding content = adding JSON files
- `public/` mirrors `data/` because Vite serves static files from public during development

### Step 1.3: Package.json Configuration

**What I did:**
```json
{
  "name": "grimwars",
  "type": "module",
  "dependencies": {
    "phaser": "^4.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.3",
    "typescript": "^5.6.3",
    "vite": "^5.4.11"
  }
}
```

**Why:**
- `"type": "module"` enables ES modules (required for Phaser 4 ESM builds)
- Phaser 4.0 (Caladan, April 2026) was chosen per spec
- React 18 for UI layer
- Vite for fast development builds

### Step 1.4: TypeScript Configuration

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  }
}
```

**Why:**
- `target: ES2022` - Modern JS features
- `moduleResolution: bundler` - Works correctly with Vite's module resolution
- `strict: true` - Catches more bugs at compile time
- `jsx: react-jsx` - Required for React 17+ JSX transform
- `paths` - Allows `@/` imports for cleaner code

---

## Phase 2: Core Types Definition

### Step 2.1: The Foundation - types.ts

**What I did:**
Created comprehensive type definitions for all game entities.

**Key decisions and why:**

1. **High-resolution HP stored separately from display**
```typescript
interface Unit {
  currentHp: number;  // e.g., 0-100 or 0-120 internally
  maxHp: number;
  // Display: derived by dividing by hp_per_model
}
```
**Why:** Combat formula uses `currentHP / maxHP` as effectiveness fraction. Hardcoding a 0-10 scale in combat logic would break the Advance Wars formula adaptation.

2. **Armor classes instead of per-unit damage tables**
```typescript
type ArmorClass = 
  | 'light_infantry' | 'heavy_infantry' | 'super_heavy_infantry'
  | 'mounted' | 'light_vehicle' | 'medium_vehicle' | 'heavy_vehicle'
  | 'fortification' | 'aircraft';
```
**Why:** When unit A attacks unit B, we look up `damage_vs_armor[A.weapon][B.armor]`. Adding a new unit only requires defining its armor class - no edits to other unit files.

3. **Combat model flag for different unit behaviors**
```typescript
combat_model: 'linear' | 'stepped';
damaged_threshold?: number;  // For stepped model
damaged_effects?: { damage_multiplier: number; movement_modifier: number };
```
**Why:** Multi-model units (infantry squads) use linear scaling. Single-model vehicles use stepped - full effectiveness until threshold, then degraded. This matches 40k vehicle rules while keeping one combat formula.

4. **Roster system for visible models**
```typescript
roster: {
  model_count: number;   // e.g., 5 models
  hp_per_model: number;  // e.g., 20 HP each = 100 total HP
};
visible_models = ceil(currentHP / hp_per_model);
```
**Why:** A 5-model intercessor squad with 20 HP each shows 5 sprites at full HP, fewer as damaged. A Land Raider (1 model, 120 HP) always shows 1 sprite. Same combat math, different visuals.

5. **Discriminated union for tile content**
```typescript
type TileContent =
  | { type: 'empty' }
  | { type: 'unit'; unitId: string }
  | { type: 'building'; buildingId: string };
```
**Why:** TypeScript's discriminated unions enable exhaustive pattern matching. Compiler catches missed cases when adding new content types.

6. **Explicit state machine phases**
```typescript
type GamePhase =
  | 'BOOT' | 'TURN_START' | 'IDLE' | 'UNIT_SELECTED'
  | 'ACTION_PREVIEW_MOVE' | 'ACTION_PREVIEW_ATTACK_FROM_CURRENT'
  | 'UNIT_ACTION_RESOLVE' | 'UNIT_SPENT' | 'TURN_END' | 'GAME_OVER'
  // Building branch
  | 'BUILDING_SELECTED' | 'ACTION_PREVIEW_BUILD' | 'BUILDING_ACTION_RESOLVE';
```
**Why:** UI interprets input based on current phase. No hidden state inference. Adding features = adding new states, not modifying existing logic.

---

## Phase 3: EventBus Implementation

### Step 3.1: The Pub/Sub Pattern

**What I did:**
```typescript
class EventBus {
  private listeners: Map<EventName, Set<EventCallback>> = new Map();
  
  on<K extends EventName>(event: K, callback: EventCallback<EventMap[K]>): () => void
  emit<K extends EventName>(event: K, payload: EventMap[K]): void
  off<K extends EventName>(event: K, callback: EventCallback<EventMap[K]>): void
}
```

**Why:**
- **Decouples game engine from UI**: Game emits events, React subscribes
- **Type-safe**: Generic constraints ensure payloads match event names
- **Return unsubscribe function**: Makes cleanup in React effects automatic

### Step 3.2: Event Types Definition

**What I did:**
```typescript
interface EventMap {
  PHASE_CHANGE: { from: GamePhase; to: GamePhase };
  UNIT_SELECTED: { unitId: string; unit: Unit };
  UNIT_MOVED: { unitId: string; from: Position; to: Position };
  UNIT_ATTACKED: { combat: CombatResult };
  // ... etc
}
```

**Why:**
- Discriminated union pattern ensures type safety
- Each event carries exactly the data needed for that specific update
- Adding new events = extending EventMap interface

---

## Phase 4: Data Registries

### Step 4.1: Registry Pattern

**What I did:**
```typescript
class Registry<T extends { id: string }> {
  private items: Map<string, T> = new Map();
  register(item: T): void { this.items.set(item.id, item); }
  get(id: string): T | undefined { return this.items.get(id); }
}
export const unitRegistry = new Registry<UnitDefinition>();
export const terrainRegistry = new Registry<TerrainType>();
```

**Why:**
- Centralized lookup avoids scattered data access
- Validation happens at load time, not runtime
- Adding content = adding JSON + calling register()

### Step 4.2: Validation at Load Time

**What I did:**
```typescript
function validateUnitDefinition(def: UnitDefinition): string[] {
  // Check armor class exists in registry
  if (!ARMOR_CLASSES.includes(def.armor)) {
    errors.push(`Unknown armor class "${def.armor}"`);
  }
  // Check stepped model has required fields
  if (def.combat_model === 'stepped' && !def.damaged_threshold) {
    errors.push('Stepped model requires damaged_threshold');
  }
}
```

**Why:**
- Catches typos (e.g., `"heavy_infnatry"`) at startup, not during gameplay
- Clear error messages point to exact problem
- Invalid data never enters the registry

---

## Phase 5: Game Logic Implementation

### Step 5.1: Movement System - A* Pathfinding

**What I did:**
```typescript
export function findPath(from: Position, to: Position, unit: Unit, state: GameState): Position[] | null {
  // A* implementation with movement cost accounting
  // Returns array of positions from start to goal (excluding start)
}

export function getReachableTiles(unit: Unit, state: GameState): Position[] {
  // Flood fill from unit position
  // Returns all tiles reachable within movement points
}
```

**Why A*:**
- Guarantees shortest path
- Handles terrain costs correctly (forest costs 2 for tread units)
- Reasonable performance for grid-based games

**Movement cost handling:**
```typescript
function getMovementCost(terrainId: string, moveType: MovementType): number | null {
  const terrain = terrainRegistry.get(terrainId);
  if (terrain.blocks_movement) return null;
  const cost = terrain.movement_cost[moveType];
  if (cost < 0) return null;  // -1 means impassable
  return cost;
}
```
**Why:** Negative values in JSON = impassable for that movement type. Road = 1 for all, Forest = 2 for tread, etc.

### Step 5.2: Combat System

**The Advance Wars Formula:**

```typescript
finalDamage = floor(baseDamage × attackerEffectiveness × rangePenalty × terrainDefense)
```

**Implementation:**
```typescript
export function calculateDamage(
  attacker: Unit,
  defender: Unit,
  weapon: Weapon,
  fromPosition: Position,
  state: GameState
): number {
  // 1. Get base damage from weapon vs defender's armor class
  const baseDamage = weapon.damage_vs_armor[defenderArmor];
  
  // 2. Apply attacker effectiveness (HP fraction)
  const effectiveness = getUnitEffectiveness(attacker);
  let damage = baseDamage * effectiveness;
  
  // 3. Apply range penalty
  damage = applyRangePenalty(damage, fromPosition, defender.position, weapon);
  
  // 4. Apply terrain defense reduction
  const terrainDefense = getTerrainDefense(defender.position, state);
  damage = damage * (1 - terrainDefense / 100);
  
  // 5. Floor and enforce minimum
  const final = Math.floor(damage);
  return final > 0 ? final : (final < 0 ? 0 : 1);
}
```

**Why each step:**

1. **Base damage lookup:** Uses armor class system - one lookup, not per-unit tables
2. **HP effectiveness:** Linear model uses `current/max`. Stepped model returns 1.0 until threshold, then applies multiplier
3. **Range penalty:** Units beyond range 1 get multiplier (e.g., 0.6 for infantry). Artillery has 1.0 (no penalty in its range band)
4. **Terrain defense:** Plains = 10%, Forest = 30%, etc. Reduces incoming damage
5. **Minimum damage:** If calculated damage rounds to 0, deal 1. Ensures weapons always "tick"

### Step 5.3: Retaliation Rules

**What I did:**
```typescript
export function canRetaliate(defender: Unit, attacker: Unit, position: Position, state: GameState): boolean {
  // 1. Defender must survive initial attack
  // 2. Defender must have weapon that can target attacker
  // 3. Attacker must be in weapon's range
  // 4. Defender must not have acted this turn
}
```

**Why these rules:**
- Survivor check: Dead units can't retaliate (obvious)
- Weapon check: Can't retaliate if weapon can't target armor class
- Range check: Must be able to shoot back
- Already acted: If unit already attacked, it's spent

---

## Phase 6: Game Engine - State Machine

### Step 6.1: State Machine Pattern

**What I did:**
```typescript
class GameEngine {
  private state: GameState | null = null;
  
  private setPhase(newPhase: GamePhase): void {
    const oldPhase = this.state.phase;
    this.state.phase = newPhase;
    eventBus.emit('PHASE_CHANGE', { from: oldPhase, to: newPhase });
    
    // Handle state transitions
    if (newPhase === 'TURN_START') this.processTurnStart();
    if (newPhase === 'TURN_END') this.processTurnEnd();
  }
}
```

**Why:**
- Centralized phase transitions
- Side effects triggered by state changes, not scattered throughout code
- Easy to add logging/debugging at one point

### Step 6.2: Turn Flow

**Turn Start:**
1. Refresh all player's units (`hasMoved = false`, `hasActed = false`)
2. Calculate income from owned buildings
3. Add income to player credits
4. Emit `TURN_START` event
5. Transition to `IDLE`

**Turn End:**
1. Emit `TURN_END` event
2. Switch active player (1 → 2, or 2 → 1)
3. If switched to Player 1, increment turn counter
4. Clear selections and previews
5. Transition to `TURN_START`

### Step 6.3: Unit Action Flow

```
IDLE → (click unit) → UNIT_SELECTED
  ↓
  ├→ (click Move) → ACTION_PREVIEW_MOVE → (click destination) → execute move
  │                          ↓
  │                 show attack preview from destination
  │                          ↓
  │                 (click target) → UNIT_ACTION_RESOLVE
  │
  ├→ (click Attack) → ACTION_PREVIEW_ATTACK_FROM_CURRENT → (click target) → UNIT_ACTION_RESOLVE
  │
  └→ (click Wait) → UNIT_SPENT → IDLE
```

**Why explicit steps:**
- Preview states show valid options before committing
- Cancellation returns to previous state
- Once resolution starts, action is committed

---

## Phase 7: Phaser Integration

### Step 7.1: Framework Separation

**What I did:**
```typescript
// src/phaser/GameScene.ts
export class GameScene extends Phaser.Scene {
  private subscribeToEvents(): void {
    eventBus.on('PHASE_CHANGE', () => this.renderOverlays());
    eventBus.on('UNIT_MOVED', () => this.renderUnits());
    // etc.
  }
}
```

**Why:**
- GameScene listens to events, never calls game logic directly
- Phaser is only for rendering
- Could swap to Canvas 2D or WebGL renderer without changing game logic

### Step 7.2: Texture Generation

**What I did:**
```typescript
createPlaceholderTextures(): void {
  const graphics = this.make.graphics({});
  // Draw circles/rectangles for unit types
  graphics.generateTexture('unit_infantry', 32, 32);
}
```

**Why placeholder textures:**
- MVP doesn't need final art
- Generated shapes are consistent and clear
- Easy to swap in PNG sprites later

### Step 7.3: Rendering Layers

**What I did:**
```typescript
create(): void {
  this.tileGraphics = this.add.graphics();     // Bottom: terrain
  this.unitContainer = this.add.container();   // Middle: units
  this.overlayGraphics = this.add.graphics(); // Top: selection, previews
}
```

**Why layer separation:**
- Terrain doesn't need to re-render every frame (static)
- Units re-render on state change
- Overlays re-render on hover/selection

---

## Phase 8: React UI

### Step 8.1: Event-Based Updates

**What I did:**
```typescript
// src/components/useGameEvent.ts
export function useGameEvent<K extends EventName>(
  event: K,
  callback: (payload: EventMap[K]) => void
): void {
  useEffect(() => {
    const unsubscribe = eventBus.on(event, callback);
    return unsubscribe;
  }, [event, callback]);
}
```

**Why:**
- UI subscribes to events, never polls game state
- React re-renders only when relevant events fire
- Cleanup prevents memory leaks

### Step 8.2: UI Components

**GameUI.tsx structure:**
- Top bar: Turn number, active player, credits
- Unit panel: Selected unit info, HP bar, action buttons
- Bottom bar: Current phase, End Turn button
- Game over modal: Winner display, Play Again

**Why:**
- Information hierarchy: most important at top
- Contextual: unit panel only shows when unit selected
- Clear actions: Move, Attack, Wait buttons

---

## Phase 9: Data Files

### Step 9.1: Unit JSON Structure

**Key decisions:**

1. **Separate primary/secondary weapons**
```json
"weapons": {
  "primary": { ... },
  "secondary": { ... }  // Optional melee weapon
}
```
**Why:** Infantry have ranged primary (Bolter) and melee secondary (Knife). Same weapon structure, different usage.

2. **Fire after move flag**
```json
"primary": {
  "fire_after_move": true   // Can move then shoot
}
"whirlwind_primary": {
  "fire_after_move": false  // Must shoot then move
}
```
**Why:** Artillery (Whirlwind) can't move and fire same turn. Regular units can. This is a tactical balancing lever.

3. **Transport tags instead of hardcoded IDs**
```json
"transport_tags_allowed": ["transport_infantry_light", "drop_pod"]
```
**Why:** Instead of `transport_ids: ["rhino", "drop_pod"]`, tags allow flexible matching. Adding a new transport doesn't require editing unit files.

### Step 9.2: Terrain JSON

**Structure:**
```json
{
  "id": "forest",
  "defense": 30,           // Reduces incoming damage by 30%
  "movement_cost": {
    "infantry": 1,
    "tread": 2,            // Tanks slower in forest
    "fly": 1               // Flying units unaffected
  },
  "blocks_movement": false,
  "can_capture": false,
  "income_per_turn": 0
}
```

**Why:**
- Defense and movement cost per type enable balanced terrain design
- `blocks_movement` for water, mountains
- `income_per_turn` for factories, cities, HQs

---

## Phase 10: Build and Git

### Step 10.1: Build Process

**Commands:**
```bash
npm run typecheck  # TypeScript validation
npm run build      # Production build
npm run dev        # Development server
```

**Why separate commands:**
- TypeScript check catches type errors before build
- Build includes bundling, minification
- Dev server includes hot reload

### Step 10.2: Git Initialization

**What I did:**
1. Created `.gitignore` (node_modules/, dist/)
2. Initial commit with all source files
3. Descriptive commit message

**Why:**
- .gitignore prevents committing build artifacts
- Early commits establish history
- Clear messages help future development

---

## Future Development Path

### Adding a New Unit
1. Add JSON to `data/units/[faction].json`
2. Register in `loader.ts` (or auto-discover)
3. Add sprite to `src/phaser/GameScene.ts`
4. No engine code changes needed

### Adding a New Map
1. Create `data/maps/[map_name].json`
2. Reference existing terrain and unit IDs
3. Load map in `loader.ts`

### Adding New Features
1. Add new state to `GamePhase` if needed
2. Implement transition logic in `engine.ts`
3. Add UI handling in `GameScene.ts` and `GameUI.tsx`
4. Add events if UI needs to react

---

## Key Architectural Principles

1. **Game logic is pure TypeScript**: No framework dependencies
2. **EventBus for communication**: Decoupled, type-safe
3. **Data-driven content**: Add files, not code
4. **Explicit state machine**: No hidden state
5. **Validation at load time**: Catch errors early
6. **Separation of concerns**: Engine, Renderer, UI are separate

---

## Troubleshooting Guide

**"Cannot find module 'phaser'"**
- Run `npm install`
- Check package.json has phaser dependency
- Verify node_modules exists

**TypeScript errors about Phaser imports**
- Use `import * as Phaser from 'phaser'` (not default import)
- Check tsconfig includes node_modules types

**Game doesn't render**
- Check browser console for errors
- Verify data files are in `public/data/` folder
- Check network tab for 404 on JSON files

**Units can't move**
- Check unit hasn't already acted this turn
- Verify terrain allows movement type
- Check movement points vs terrain costs

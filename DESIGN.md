# GrimWars: Dark Future - Design Document

## Overview

GrimWars: Dark Future is a turn-based tactical strategy game inspired by Advance Wars, Wargroove, and Warhammer 40k. The game is being built as a solo indie project with the goal of creating a modular, data-driven engine that allows for easy expansion of new factions and content.

## Technology Stack

- **Frontend**: React 18 + TypeScript
- **Game Engine**: Phaser 4.0 (Caladan)
- **Bundler**: Vite 5
- **Distribution**: Browser-based (shareable link)

## Architecture

### Core Principles

1. **Framework-Agnostic Game Logic**: All game state and logic lives in `src/game/` as plain TypeScript, completely independent of the rendering framework.

2. **Event-Driven UI**: React reads game state via an EventBus and writes to it only by dispatching player-intent events. This ensures the game logic is testable and the UI is reactive.

3. **Data-Driven Content**: Units, terrain, maps, weapons, and armor classes all live in JSON files loaded into typed registries at startup. Adding content = adding files, not changing engine code.

4. **Explicit State Machine**: All input interpretation and game flow is handled by a finite state machine. No hidden state inference.

### Directory Structure

```
src/
├── game/           # Framework-agnostic game logic
│   ├── types.ts    # Core type definitions
│   ├── events.ts   # EventBus and event types
│   ├── registry.ts # Data registries
│   ├── movement.ts # Pathfinding and movement
│   ├── combat.ts   # Combat resolution
│   ├── engine.ts   # Game engine and state machine
│   └── loader.ts   # Data file loading
├── phaser/         # Phaser-specific rendering
│   ├── GameScene.ts
│   └── config.ts
├── components/     # React UI components
│   ├── GameUI.tsx
│   └── useGameEvent.ts
└── App.tsx        # Main React entry

data/
├── units/          # Unit JSON definitions
├── terrain/        # Terrain type definitions
└── maps/           # Map data files
```

## Game State Machine

### Global States

| State | Description |
|-------|-------------|
| `BOOT` | Assets/data load, map instantiation |
| `TURN_START` | Refresh units, apply start-of-turn effects, collect income |
| `IDLE` | No unit selected; player may inspect or select |
| `UNIT_SELECTED` | Ready unit selected; show legal actions |
| `UNIT_MOVED` | Unit has moved; showing post-move actions |
| `ACTION_PREVIEW_MOVE` | Show reachable tiles and path preview |
| `ACTION_PREVIEW_ATTACK_FROM_CURRENT` | Show valid targets from current position |
| `ACTION_PREVIEW_ATTACK_AFTER_MOVE` | Show valid targets from destination tile |
| `ACTION_PREVIEW_CAPTURE` | Show capture target |
| `ACTION_PREVIEW_LOAD` | Show valid transports to load into |
| `ACTION_PREVIEW_UNLOAD` | Show valid tiles to unload unit |
| `ACTION_PREVIEW_MERGE` | Show valid merge targets |
| `ACTION_CONFIRM` | Awaiting player confirmation |
| `UNIT_ACTION_RESOLVE` | Animate and apply action |
| `UNIT_SPENT` | Unit marked spent; return to IDLE |
| `TURN_END` | Process cleanup, swap active player, go to TURN_START |
| `GAME_OVER` | Winner determined; input limited |
| `BUILDING_SELECTED` | Owned building selected |
| `ACTION_PREVIEW_BUILD` | Show unit production menu |
| `ACTION_CONFIRM_BUILD` | Confirm spending credits |
| `BUILDING_ACTION_RESOLVE` | Create unit, deduct credits |

## Deferred Features

### Core Gameplay
- Building capture progress (infantry adjacent to neutral building)
- Building attack (enemy building retaliates)
- Building repair (restore friendly building HP)
- Building income system (resource buildings grant income per turn)
- Unit production from factories

### Units & Logistics
- Fuel and ammo system
- Supply/resupply mechanics
- Transport units (load/unload)
- Unit merging
- Movement preview highlighting (grey out occupied tiles)

### AI & Opponents
- AI opponents
- Fog of War

### Faction System
- CO/Warlord powers (Strategem system)
- Faction-specific bonuses

### Controls & UI
- Keyboard/controller controls
- Sound effects and animations

### Advanced Terrain
- Passable-for-air terrain (fly over, can't land)
- Flyover for all buildings

## Combat System

### Damage Formula

```
finalDamage = floor(
  baseDamage × attackerEffectiveness × rangePenalty × terrainDefenseReduction
)
```

Where:
- `attackerEffectiveness = currentHP / maxHP` (linear model)
- `rangePenalty = 1.0` for range 1, `weapon.range_penalty_multiplier` beyond
- `terrainDefenseReduction = 1 - (terrain.defense / 100)`

### Retaliation Rules

1. Defender must survive initial damage
2. Defender must have a weapon that can target attacker
3. Attacker must be within weapon's range band
4. Defender uses HP **after** taking incoming damage for retaliation calculation

### Combat Models

- **Linear**: Effectiveness scales with HP fraction (standard AW-style)
- **Stepped**: Full effectiveness until damaged_threshold, then applies damaged_effects modifiers

## Data Schemas

### Unit Definition

```typescript
interface UnitDefinition {
  id: string;
  name: string;
  faction: string;
  category: 'infantry' | 'vehicle' | 'aircraft';
  cost: number;
  roster: { model_count: number; hp_per_model: number };
  combat_model: 'linear' | 'stepped';
  damaged_threshold?: number;
  damaged_effects?: { damage_multiplier: number; movement_modifier: number };
  armor: ArmorClass;
  movement: { points: number; type: MovementType };
  vision: number;
  fuel: number;
  ammo: number;
  can_capture: boolean;
  transport_tags_allowed: string[];
  weapons: {
    primary: Weapon;
    secondary?: Weapon;
  };
}
```

### Armor Classes

- `light_infantry` - Guardsmen, Cultists
- `heavy_infantry` - Intercessors, Ork Boyz
- `super_heavy_infantry` - Terminators, Meganobz
- `mounted` - Outriders, Windriders
- `light_vehicle` - Land Speeders, Sentinels
- `medium_vehicle` - Rhinos, Dreadnoughts, Chimeras
- `heavy_vehicle` - Land Raiders, Predators, Leman Russ
- `fortification` - Buildings, Bunkers, HQs
- `aircraft` - Stormravens, Dakkajets

## Movement System

- A* pathfinding with movement cost accounting
- Per-unit movement points and per-terrain costs
- Ground units cannot move through enemy units
- Air units may move over ground units
- Enemy air units block hostile airspace

## MVP Features (Completed)

1. Tile grid rendering
2. Unit selection with movement range preview
3. Unit movement along paths
4. Combat between units with damage calculation
5. Turn-based player alternation
6. Army elimination win condition
7. HQ capture win condition

## Current Implementation Status

### Rendering Stack

**Active (Current):** React-based rendering via `GameBoard.tsx`
- All game rendering (terrain, units, buildings) uses React components
- Tile overlays (selection, movement previews) rendered via CSS
- Game logic remains framework-agnostic in `src/game/`

**Inactive (Deferred):** Phaser-based rendering via `GameScene.ts`
- Phaser 4.0 framework code exists in `src/phaser/` but is not currently wired up
- The `createGameConfig` in `src/phaser/config.ts` is never called
- GameScene event listeners are registered but never triggered

### Priority Guidance

When adding new features or adjusting UI:
1. Prefer React/GameBoard implementation - this is the working path
2. Do not prioritize GameScene integration - it is a distant future goal
3. Keep game logic in `src/game/` to maintain framework-agnostic design

## Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Start development server
npm run build        # Build for production
npm run typecheck    # Run TypeScript type checking
```

## Future Expansion

Adding a new faction requires:
1. Creating a new JSON file in `data/units/` with unit definitions
2. Adding unit sprites to the assets folder
3. No engine code changes required

Adding a new map requires:
1. Creating a new JSON file in `data/maps/`
2. Referencing existing terrain and unit IDs
3. No engine code changes required

# GrimWars TODO - Deferred Features

## Building Fixes
- [ ] ESC key deselects buildings (BUILDING_SELECTED phase handler)
- [ ] Hover panel shows building (HP, type, owner) not terrain when tile has building
- [ ] Prevent units from moving onto building tiles

## Building Actions
- [x] Building selection and highlighting (done)
- [ ] Capture: Infantry adjacent to neutral building (instant, 1 action)
- [ ] Attack: Any unit adjacent to enemy building (building retaliates with light infantry damage)
- [ ] Repair: Any unit adjacent to friendly building (restore to full HP)

## Faction System
- [ ] Add faction/Strategem system (Warhammer 40k CO powers)

## Advanced Terrain
- [ ] Passable-for-air terrain (fly OVER, can't land)

## Known Issues (Pre-Fix List)
- Predator weapon swap in progress - verify final damage calculations still work
- Build system warnings (unused terrainRegistry import) - cleanup later
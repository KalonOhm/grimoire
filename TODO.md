# GrimWars TODO - Deferred Features

## Building Fixes
- [x] Prevent units from moving onto building tiles (done)
- [x] Building selection and highlighting (done)
- [ ] Restore building content when unit moves off (done for executeMove)
- [ ] Hover panel shows building (HP, type, owner) not terrain when tile has building

## Keyboard Controls (Known Issue)
- Phaser 4 keyboard events not firing - TODO: Fix or remove
- Removed commented keyboard code, using mouse-only for now
- Need cancel buttons in action menus instead

## Building Actions
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
# GrimWars TODO - Deferred Features

## Unit Fixes
- [ ] Add per-unit supply values (fuel for moving, ammo for heavy weapons)
- [ ] add resupply -all units adjacent to any friendly building at turn start, or an action for the faction's dedicated transport unit/s. 
- [ ] add transport ability (one unit, infantry starting out)
- [ ] can_embark, embark action to infantry context menu
- [ ] disembark action to full transport context menu,
- [ ] add rhino as space marine transport 

## Building Fixes
- [ ] make 1 factory for each player already under their control. 
- [ ] add unit production from factories
- [ ] add additional neutral resource income buildings around the map.

## Movement & Action Menu
- [x] Grey out occupied/invalid tiles in movement preview (buildings, other units)
- [ ] Add keyboard/controller controls

## Keyboard Controls (Known Issue)
- [ ] ~~consider controller controls, selection reticle that snaps to grid, buttons to select, buttons to cancel and to end turn~~

## Building Actions
- [x] Capture: Infantry adjacent to neutral building (instant, 1 action)
- [x] Contest: Stop enemy capture of neutral/enemy building (10% damage to each enemy capturer, 5%×enemies to contestant)
- [ ] Attack: Any unit adjacent to enemy building (building retaliates with light infantry damage)
- [ ] Repair: Any unit adjacent to friendly building (restore to full HP)
- [ ] repair and unit deploy subtracks from resources. 

## Faction System
- [ ] Add faction/Strategem system (Warhammer 40k CO powers)

## Advanced Terrain
- [ ] Passable-for-air terrain (fly OVER, can't land)
- [x] apply flyover to all buildings - works for assault jump squad (hover movement)

## AI & Systems
- [ ] Add AI opponents
- [ ] Add Fog of War
- [ ] Add sound effects and animations

## Known Issues (Pre-Fix List)
- [x] Verify combat calculations still work
- [x] Whirlwind fire_after_move - fixed to check each weapon individually
- [x] Whirlwind attack after move - only aux weapon targets shown
- [x] Movement blocking - vehicle/monster block each other, infantry/mounted can pass through friendlies
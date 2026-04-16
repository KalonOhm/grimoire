# GrimWars TODO - Deferred Features

## Unit Fixes
- [ ] Add per-unit supply values (fuel for moving, ammo for heavy weapons)
- [ ] add resupply -all units adjacent to any friendly building at turn start, or an action for the faction's dedicated transport unit/s. 
- [ ] add transport ability (one unit, infantry starting out)
- [ ] can_embark, embark action to infantry context menu
- [ ] disembark action to full transport context menu,
- [ ] add rhino as space marine transport 

## Building Fixes
- [ ] Add income-producing building type. Mine or manufacturing building would make sense, but abstracted to any form of resource. Possible add 2, to track multiple resources. 
- [ ] make 1 factory for each player already under their control. 
- [ ] make 1 resource building under each player's control.
- [ ] add additional neutral resource income buildings around the map.

## Movement & Action Menu
- [x] Grey out occupied/invalid tiles in movement preview (buildings, other units)
- [ ] Add keyboard/controller controls


## Keyboard Controls (Known Issue)
- [ ] ~~consider controller controls, selection reticle that snaps to grid, buttons to select, buttons to cancel and to end turn~~

## Building Actions
- [ ] Capture: Infantry adjacent to neutral building (instant, 1 action)
- [ ] Attack: Any unit adjacent to enemy building (building retaliates with light infantry damage)
- [ ] Repair: Any unit adjacent to friendly building (restore to full HP)
- [ ] repair and unit deploy subtracks from credits. 
- [ ] Resource buildings - not an action, but gain income at start of player turn. 

## Faction System
- [ ] Add faction/Strategem system (Warhammer 40k CO powers)

## Advanced Terrain
- [ ] Passable-for-air terrain (fly OVER, can't land)
- [ ] apply flyover to all buildings - this already appears to work for assault jump squad

## AI & Systems
- [ ] Add AI opponents
- [ ] Add Fog of War
- [ ] Add sound effects and animations
- [ ] Add unit production from factories

## Known Issues (Pre-Fix List)
- Verify combat calculations still work
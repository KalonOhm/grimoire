# GrimWars TODO - Deferred Features

## Building Fixes
- [x] Prevent units from moving onto building tiles (done)
- [x] Building selection and highlighting (done)
- [x] Removed building restoration (not needed - units can't be on buildings)
- [ ] Hover panel shows building (HP, type, owner) not terrain when tile has building
- [ ] Building selection needs CANCEL button in context menu

## Movement & Action Menu
- [x] After movement: Go to UNIT_MOVED instead of auto-attack
- [ ] Show action context menu in UNIT_MOVED: Attack / Wait / Cancel
- [ ] Wait button: endUnitTurn() returns to IDLE
- [ ] Grey out occupied/invalid tiles in movement preview (buildings, other units)
- [ ] Cancel button in action menus to return to IDLE

## Keyboard Controls (Known Issue)
- [x] Disabled non-functional keyboard (Phaser 4 issue)
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
- Verify combat calculations still work
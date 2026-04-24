const fs = require('fs');
const path = require('path');

const terrainPath = path.join(__dirname, '../data/terrain/terrain.json');
const terrainData = JSON.parse(fs.readFileSync(terrainPath, 'utf8'));

// 1. Plains: Tires to 2
const plains = terrainData.find(t => t.id === 'plains');
if (plains) plains.movement_cost.tire = 2;

// 2. Ruins: Tires to 2
const ruins = terrainData.find(t => t.id === 'ruins');
if (ruins) ruins.movement_cost.tire = 2;

// 3. Forest: Tires to 3, Treads to 2 (Treads is already 2, but just in case)
const forest = terrainData.find(t => t.id === 'forest');
if (forest) {
  forest.movement_cost.tire = 3;
  forest.movement_cost.tread = 2;
}

// 4. Add Wasteland (clone of updated Forest)
const wasteland = JSON.parse(JSON.stringify(forest));
wasteland.id = 'wasteland';
wasteland.name = 'Wasteland';
terrainData.push(wasteland);

// 5. Add Barrens (clone of updated Plains)
const barrens = JSON.parse(JSON.stringify(plains));
barrens.id = 'barrens';
barrens.name = 'Barrens';
terrainData.push(barrens);

// 6. Add Stronghold (40 def, 1 move cost for ground units)
terrainData.push({
  id: "stronghold",
  name: "Stronghold",
  defense: 40,
  movement_cost: {
    foot: 1,
    tread: 1,
    tire: 1,
    fly: 1,
    hover: 1,
    mech: 1,
    naval: -1,
    mount: 1
  },
  blocks_movement: false,
  can_capture: false,
  income_per_turn: 0
});

fs.writeFileSync(terrainPath, JSON.stringify(terrainData, null, 2));
console.log('Terrain updated successfully');

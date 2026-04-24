const fs = require('fs');
const path = require('path');

const terrainPath = path.join(__dirname, '../data/terrain/terrain.json');
const terrainData = JSON.parse(fs.readFileSync(terrainPath, 'utf8'));

for (const t of terrainData) {
  if (t.id === 'river') {
    t.defense = -20;
    t.movement_cost.mount = 4;
  }
  if (t.id === 'forest' || t.id === 'wasteland') {
    t.movement_cost.foot = 2;
    t.movement_cost.mount = 3;
    t.movement_cost.tread = 3;
    t.movement_cost.tire = 4;
  }
  if (t.id === 'mountain') {
    t.movement_cost.foot = 3;
    t.movement_cost.mount = -1;
  }
  if (t.id === 'ruins') {
    t.movement_cost.tire = -1;
  }
}

fs.writeFileSync(terrainPath, JSON.stringify(terrainData, null, 2));
console.log('Terrain tweaks applied successfully');

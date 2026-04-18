import { Position, Unit, GameState } from '../game/types';
import { unitRegistry, terrainRegistry } from '../game/registry';
import './HoverInfoPanel.css';

const TERRAIN_NAMES: Record<string, string> = {
  plains: 'Plains',
  forest: 'Forest',
  road: 'Road',
  water: 'Water',
  mountain: 'Mountain',
  river: 'River',
  bridge: 'Bridge',
  hq: 'HQ',
  factory: 'Factory',
  city: 'City',
  ruins: 'Ruins',
  impassable: 'Impassable',
};

interface HoverInfoPanelProps {
  state: GameState;
  hoveredTile: Position | null;
}

export function HoverInfoPanel({ state, hoveredTile }: HoverInfoPanelProps) {
  if (!hoveredTile) {
    return null;
  }

  const tile = state.map[hoveredTile.y]?.[hoveredTile.x];
  if (!tile) {
    return null;
  }

  const terrain = terrainRegistry.get(tile.terrainId);
  const terrainName = TERRAIN_NAMES[tile.terrainId] || tile.terrainId;
  const defense = terrain?.defense || 0;

  // Check for building in state.buildings (Wargroove-style)
  let building: { buildingType: string; owner: number | null; hp: number; maxHp: number } | null = null;
  for (const b of state.buildings.values()) {
    if (b.position.x === hoveredTile.x && b.position.y === hoveredTile.y) {
      building = { buildingType: b.buildingType, owner: b.owner, hp: b.hp, maxHp: b.maxHp };
      break;
    }
  }

  let unit: Unit | null = null;
  if (tile.content.type === 'unit') {
    unit = state.units.get(tile.content.unitId) || null;
  }

  const unitDef = unit ? unitRegistry.get(unit.definitionId) : null;

  return (
    <div className="hover-info-panel">
      {/* Unit OR Building info on top (unit takes priority) */}
      {unit && unitDef && (
        <div className="hover-info-section">
          <div className="hover-info-row">
            <span className="hover-info-label">Unit:</span>
            <span className="hover-info-value">{unitDef.name}</span>
          </div>
          <div className="hover-info-row">
            <span className="hover-info-label">Armor:</span>
            <span className="hover-info-value">{unitDef.armor.replace(/_/g, ' ')}</span>
          </div>
          <div className="hover-info-row">
            <span className="hover-info-label">Aux:</span>
            <span className="hover-info-value">{unitDef.weapons.auxiliary.name}</span>
          </div>
          {unitDef.weapons.special && (
            <div className="hover-info-row">
              <span className="hover-info-label">Spec:</span>
              <span className="hover-info-value">
                {unitDef.weapons.special.name} ({unit.ammo})
              </span>
            </div>
          )}
          <div className="hover-info-row">
            <span className="hover-info-label">Supply:</span>
            <span className="hover-info-value">{unit.supply}</span>
          </div>
          <div className="hover-info-row">
            <span className="hover-info-label">HP:</span>
            <span className="hover-info-value">
              {Math.round((unit.currentHp / unit.maxHp) * 10)}/10
            </span>
          </div>
        </div>
      )}
      {building && !unit && (
        <div className="hover-info-section">
          <div className="hover-info-row">
            <span className="hover-info-label">Building:</span>
            <span className="hover-info-value">{building.buildingType.toUpperCase()}</span>
          </div>
          <div className="hover-info-row">
            <span className="hover-info-label">HP:</span>
            <span className="hover-info-value">{building.hp}/{building.maxHp}</span>
          </div>
          <div className="hover-info-row">
            <span className="hover-info-label">Owner:</span>
            <span className="hover-info-value">
              {building.owner === null ? 'Neutral' : `Player ${building.owner}`}
            </span>
          </div>
        </div>
      )}

      {/* Terrain info always below */}
      <div className="hover-info-section">
        <div className="hover-info-row">
          <span className="hover-info-label">Terrain:</span>
          <span className="hover-info-value">{terrainName}</span>
        </div>
        <div className="hover-info-row">
          <span className="hover-info-label">Defense:</span>
          <span className="hover-info-value">{defense}%</span>
        </div>
      </div>
    </div>
  );
}

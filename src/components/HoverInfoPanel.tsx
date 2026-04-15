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

  let buildingOwner: number | null = null;
  if (tile.terrainId === 'hq' || tile.terrainId === 'factory' || tile.terrainId === 'city') {
    for (const building of state.buildings.values()) {
      if (building.position.x === hoveredTile.x && building.position.y === hoveredTile.y) {
        buildingOwner = building.owner;
        break;
      }
    }
  }

  let unit: Unit | null = null;
  if (tile.content.type === 'unit') {
    unit = state.units.get(tile.content.unitId) || null;
  }

  const unitDef = unit ? unitRegistry.get(unit.definitionId) : null;

  return (
    <div className="hover-info-panel">
      <div className="hover-info-section">
        <div className="hover-info-row">
          <span className="hover-info-label">Terrain:</span>
          <span className="hover-info-value">{terrainName}</span>
        </div>
        <div className="hover-info-row">
          <span className="hover-info-label">Defense:</span>
          <span className="hover-info-value">{defense}%</span>
        </div>
        {tile.terrainId === 'hq' || tile.terrainId === 'factory' || tile.terrainId === 'city' ? (
          <div className="hover-info-row">
            <span className="hover-info-label">Owner:</span>
            <span className="hover-info-value">
              {buildingOwner === null ? 'Neutral' : `Player ${buildingOwner}`}
            </span>
          </div>
        ) : null}
      </div>

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
            <span className="hover-info-label">Weapon:</span>
            <span className="hover-info-value">{unitDef.weapons.primary.name}</span>
          </div>
          <div className="hover-info-row">
            <span className="hover-info-label">HP:</span>
            <span className="hover-info-value">
              {Math.round((unit.currentHp / unit.maxHp) * 10)}/10
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

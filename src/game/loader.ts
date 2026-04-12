import { UnitDefinition, TerrainType, MapData } from './types';
import { unitRegistry, terrainRegistry, mapRegistry, validateUnitDefinition } from './registry';

interface LoadResult {
  success: boolean;
  errors: string[];
}

export async function loadTerrainData(): Promise<LoadResult> {
  const errors: string[] = [];

  try {
    const response = await fetch('/data/terrain/terrain.json');
    if (!response.ok) {
      return { success: false, errors: [`Failed to load terrain data: ${response.status}`] };
    }

    const terrainData: TerrainType[] = await response.json();

    for (const terrain of terrainData) {
      if (!terrain.id) {
        errors.push('Terrain entry missing id');
        continue;
      }
      terrainRegistry.register(terrain);
    }

    return { success: errors.length === 0, errors };
  } catch (error) {
    return { success: false, errors: [`Error loading terrain: ${error}`] };
  }
}

export async function loadUnitData(): Promise<LoadResult> {
  const errors: string[] = [];

  try {
    const response = await fetch('/data/units/space_marines.json');
    if (!response.ok) {
      return { success: false, errors: [`Failed to load unit data: ${response.status}`] };
    }

    const unitData: UnitDefinition[] = await response.json();

    for (const unit of unitData) {
      const validationErrors = validateUnitDefinition(unit);
      if (validationErrors.length > 0) {
        errors.push(...validationErrors);
        continue;
      }
      unitRegistry.register(unit);
    }

    return { success: errors.length === 0, errors };
  } catch (error) {
    return { success: false, errors: [`Error loading units: ${error}`] };
  }
}

export async function loadMapData(): Promise<LoadResult> {
  const errors: string[] = [];

  try {
    const response = await fetch('/data/maps/skirmish_1.json');
    if (!response.ok) {
      return { success: false, errors: [`Failed to load map data: ${response.status}`] };
    }

    const mapData: MapData = await response.json();

    if (!mapData.id) {
      errors.push('Map missing id');
    }
    if (!mapData.name) {
      errors.push('Map missing name');
    }
    if (!mapData.width || !mapData.height) {
      errors.push('Map missing dimensions');
    }
    if (!mapData.terrain || mapData.terrain.length === 0) {
      errors.push('Map missing terrain data');
    }

    for (let y = 0; y < mapData.height; y++) {
      for (let x = 0; x < mapData.width; x++) {
        const terrainId = mapData.terrain[y]?.[x];
        if (!terrainId) {
          errors.push(`Map missing terrain at position (${x}, ${y})`);
          continue;
        }
        if (!terrainRegistry.has(terrainId)) {
          errors.push(`Map references unknown terrain: ${terrainId}`);
        }
      }
    }

    for (const unitPlacement of mapData.units) {
      if (!unitRegistry.has(unitPlacement.definitionId)) {
        errors.push(`Map references unknown unit: ${unitPlacement.definitionId}`);
      }
      if (unitPlacement.position.x < 0 || unitPlacement.position.x >= mapData.width) {
        errors.push(`Unit ${unitPlacement.definitionId} has invalid x position`);
      }
      if (unitPlacement.position.y < 0 || unitPlacement.position.y >= mapData.height) {
        errors.push(`Unit ${unitPlacement.definitionId} has invalid y position`);
      }
    }

    if (errors.length === 0) {
      mapRegistry.register(mapData);
    }

    return { success: errors.length === 0, errors };
  } catch (error) {
    return { success: false, errors: [`Error loading map: ${error}`] };
  }
}

export async function loadAllData(): Promise<LoadResult> {
  const allErrors: string[] = [];

  const terrainResult = await loadTerrainData();
  allErrors.push(...terrainResult.errors);

  const unitResult = await loadUnitData();
  allErrors.push(...unitResult.errors);

  const mapResult = await loadMapData();
  allErrors.push(...mapResult.errors);

  return { success: allErrors.length === 0, errors: allErrors };
}

import * as Phaser from 'phaser';
import { GameState, Position, Tile } from '../game/types';
import { gameEngine } from '../game/engine';
import { eventBus } from '../game/events';
import { unitRegistry, terrainRegistry } from '../game/registry';

const TILE_SIZE = 64;
const COLORS = {
  PLains: 0x4a7c3f,
  FOREST: 0x2d5a27,
  ROAD: 0x8b7355,
  WATER: 0x1a4d7c,
  IMPASSABLE: 0x3a3a3a,
  HQ: 0x8b0000,
  FACTORY: 0x555555,
  CITY: 0x6b6b6b,
  MOVE_PREVIEW: 0x4488ff,
  ATTACK_PREVIEW: 0xff4444,
  SELECTED: 0xffff00,
  UNIT_ALLY: 0x4488ff,
  UNIT_ENEMY: 0xff4444,
  UNIT_SPENT: 0x666666,
  BUILDING_ALLY: 0x4488ff,
  BUILDING_NEUTRAL: 0x888888,
  BUILDING_ENEMY: 0xff4444,
};

export class GameScene extends Phaser.Scene {
  private tileGraphics!: Phaser.GameObjects.Graphics;
  private unitContainer!: Phaser.GameObjects.Container;
  private overlayGraphics!: Phaser.GameObjects.Graphics;
  private state: GameState | null = null;
  private unsubscribeFunctions: (() => void)[] = [];

  constructor() {
    super({ key: 'GameScene' });
  }

  preload(): void {
    this.createPlaceholderTextures();
  }

  create(): void {
    this.tileGraphics = this.add.graphics();
    this.unitContainer = this.add.container(0, 0);
    this.overlayGraphics = this.add.graphics();

    this.setupInput();
    this.subscribeToEvents();

    const state = gameEngine.getState();
    if (state) {
      this.renderMap(state.map);
      this.renderUnits(state);
    }

    this.cameras.main.setBackgroundColor('#1a1a2e');
  }

  private createPlaceholderTextures(): void {
    const graphics = this.make.graphics({});

    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(16, 16, 14);
    graphics.fillStyle(0x000000, 1);
    graphics.fillCircle(16, 16, 12);

    graphics.generateTexture('unit_infantry', 32, 32);
    graphics.destroy();

    const tankGraphics = this.make.graphics({});
    tankGraphics.fillStyle(0xffffff, 1);
    tankGraphics.fillRect(4, 8, 24, 16);
    tankGraphics.fillStyle(0x000000, 1);
    tankGraphics.fillRect(8, 12, 16, 8);
    tankGraphics.generateTexture('unit_vehicle', 32, 32);
    tankGraphics.destroy();

    const artilleryGraphics = this.make.graphics({});
    artilleryGraphics.fillStyle(0xffffff, 1);
    artilleryGraphics.fillRect(6, 10, 20, 12);
    artilleryGraphics.fillStyle(0x000000, 1);
    artilleryGraphics.fillRect(20, 8, 10, 4);
    artilleryGraphics.generateTexture('unit_artillery', 32, 32);
    artilleryGraphics.destroy();

    const buildingGraphics = this.make.graphics({});
    buildingGraphics.fillStyle(0x888888, 1);
    buildingGraphics.fillRect(4, 4, 56, 56);
    buildingGraphics.fillStyle(0x444444, 1);
    buildingGraphics.fillRect(8, 8, 48, 48);
    buildingGraphics.generateTexture('building', 64, 64);
    buildingGraphics.destroy();

    const hqGraphics = this.make.graphics({});
    hqGraphics.fillStyle(0x8b0000, 1);
    hqGraphics.fillRect(0, 0, 64, 64);
    hqGraphics.fillStyle(0xff4444, 1);
    hqGraphics.fillRect(8, 8, 48, 48);
    hqGraphics.generateTexture('hq', 64, 64);
    hqGraphics.destroy();

    const factoryGraphics = this.make.graphics({});
    factoryGraphics.fillStyle(0x555555, 1);
    factoryGraphics.fillRect(0, 0, 64, 64);
    factoryGraphics.fillStyle(0x888888, 1);
    factoryGraphics.fillRect(8, 8, 48, 48);
    factoryGraphics.generateTexture('factory', 64, 64);
    factoryGraphics.destroy();
  }

  private setupInput(): void {
    this.input.on('pointermove', (_pointer: Phaser.Input.Pointer) => {
      this.renderOverlays();
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.state) return;
      if (pointer.button !== 0) return;

      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const tileX = Math.floor(worldPoint.x / TILE_SIZE);
      const tileY = Math.floor(worldPoint.y / TILE_SIZE);

      const position: Position = { x: tileX, y: tileY };

      this.handleTileClick(position);
    });

    this.input.keyboard?.on('keydown-ESCAPE', () => {
      this.handleCancel();
    });

    this.input.keyboard?.on('keydown-SPACE', () => {
      if (this.state?.phase === 'UNIT_SELECTED') {
        gameEngine.endUnitTurn();
      }
    });

    this.input.keyboard?.on('keydown-ENTER', () => {
      if (this.state && this.state.phase !== 'GAME_OVER') {
        gameEngine.endTurn();
      }
    });
  }

  private handleTileClick(position: Position): void {
    if (!this.state) return;

    const phase = this.state.phase;

    switch (phase) {
      case 'IDLE':
      case 'UNIT_SELECTED': {
        const tile = gameEngine.getTileAt(position);
        if (!tile) return;

        if (tile.content.type === 'unit') {
          const unit = gameEngine.getUnitAt(position);
          if (unit) {
            if (unit.owner === this.state.activePlayer) {
              if (this.state.phase === 'UNIT_SELECTED' && this.state.selectedUnitId === unit.instanceId) {
                gameEngine.deselectUnit();
              } else {
                if (this.state.selectedUnitId) {
                  gameEngine.deselectUnit();
                }
                gameEngine.selectUnit(unit.instanceId);
              }
            } else if (this.state.phase === 'UNIT_SELECTED' && this.state.selectedUnitId) {
              gameEngine.showAttackPreviewFromCurrent();
              const attackPreview = this.state.attackPreview;
              if (attackPreview && attackPreview.targets.some(t => t.unitId === unit.instanceId)) {
                gameEngine.executeAttack(unit.instanceId);
              }
            }
          }
        } else if (tile.content.type === 'building') {
          const building = gameEngine.getBuildingAt(position);
          if (building) {
            gameEngine.selectBuilding(building.id);
          }
        } else if (this.state.phase === 'UNIT_SELECTED') {
          gameEngine.showMovePreview();
        }
        break;
      }

      case 'ACTION_PREVIEW_MOVE': {
        const movePreview = this.state.movePreview;
        if (movePreview && movePreview.reachableTiles.some(t => t.x === position.x && t.y === position.y)) {
          gameEngine.selectMoveDestination(position);
          gameEngine.executeMove(position);
        } else {
          gameEngine.hideMovePreview();
        }
        break;
      }

      case 'ACTION_PREVIEW_ATTACK_FROM_CURRENT':
      case 'ACTION_PREVIEW_ATTACK_AFTER_MOVE': {
        const attackPreview = this.state.attackPreview;
        if (attackPreview) {
          const target = attackPreview.targets.find(t => t.position.x === position.x && t.position.y === position.y);
          if (target) {
            gameEngine.executeAttack(target.unitId);
          } else {
            gameEngine.hideAttackPreview();
          }
        }
        break;
      }
    }
  }

  private handleCancel(): void {
    if (!this.state) return;

    switch (this.state.phase) {
      case 'UNIT_SELECTED':
        gameEngine.deselectUnit();
        break;
      case 'ACTION_PREVIEW_MOVE':
        gameEngine.hideMovePreview();
        break;
      case 'ACTION_PREVIEW_ATTACK_FROM_CURRENT':
      case 'ACTION_PREVIEW_ATTACK_AFTER_MOVE':
        gameEngine.hideAttackPreview();
        break;
      case 'BUILDING_SELECTED':
        gameEngine.deselectBuilding();
        break;
    }
  }

  private subscribeToEvents(): void {
    this.unsubscribeFunctions.push(
      eventBus.on('PHASE_CHANGE', () => {
        this.state = gameEngine.getState();
        this.renderOverlays();
      })
    );

    this.unsubscribeFunctions.push(
      eventBus.on('UNIT_SELECTED', () => {
        this.state = gameEngine.getState();
        this.renderOverlays();
      })
    );

    this.unsubscribeFunctions.push(
      eventBus.on('UNIT_DESELECTED', () => {
        this.state = gameEngine.getState();
        this.renderOverlays();
      })
    );

    this.unsubscribeFunctions.push(
      eventBus.on('MOVE_PREVIEW_SHOWN', () => {
        this.state = gameEngine.getState();
        this.renderOverlays();
      })
    );

    this.unsubscribeFunctions.push(
      eventBus.on('MOVE_PREVIEW_HIDDEN', () => {
        this.state = gameEngine.getState();
        this.renderOverlays();
      })
    );

    this.unsubscribeFunctions.push(
      eventBus.on('ATTACK_PREVIEW_SHOWN', () => {
        this.state = gameEngine.getState();
        this.renderOverlays();
      })
    );

    this.unsubscribeFunctions.push(
      eventBus.on('ATTACK_PREVIEW_HIDDEN', () => {
        this.state = gameEngine.getState();
        this.renderOverlays();
      })
    );

    this.unsubscribeFunctions.push(
      eventBus.on('UNIT_MOVED', () => {
        this.state = gameEngine.getState();
        if (this.state) this.renderUnits(this.state);
        this.renderOverlays();
      })
    );

    this.unsubscribeFunctions.push(
      eventBus.on('UNIT_ATTACKED', () => {
        this.state = gameEngine.getState();
        if (this.state) this.renderUnits(this.state);
        this.renderOverlays();
      })
    );

    this.unsubscribeFunctions.push(
      eventBus.on('UNIT_DESTROYED', () => {
        this.state = gameEngine.getState();
        if (this.state) this.renderUnits(this.state);
        this.renderOverlays();
      })
    );

    this.unsubscribeFunctions.push(
      eventBus.on('TURN_START', () => {
        this.state = gameEngine.getState();
        if (this.state) this.renderUnits(this.state);
        this.renderOverlays();
      })
    );

    this.unsubscribeFunctions.push(
      eventBus.on('GAME_OVER', () => {
        this.state = gameEngine.getState();
        this.renderOverlays();
      })
    );
  }

  private renderMap(map: Tile[][]): void {
    this.tileGraphics.clear();

    for (let y = 0; y < map.length; y++) {
      for (let x = 0; x < (map[0]?.length || 0); x++) {
        const tile = map[y][x];
        const terrain = terrainRegistry.get(tile.terrainId);

        let color = COLORS.PLains;
        if (terrain) {
          switch (terrain.id) {
            case 'plains':
              color = COLORS.PLains;
              break;
            case 'forest':
              color = COLORS.FOREST;
              break;
            case 'road':
              color = COLORS.ROAD;
              break;
            case 'water':
              color = COLORS.WATER;
              break;
            case 'impassable':
              color = COLORS.IMPASSABLE;
              break;
            case 'hq':
              color = COLORS.HQ;
              break;
            case 'factory':
              color = COLORS.FACTORY;
              break;
            case 'city':
              color = COLORS.CITY;
              break;
            default:
              color = COLORS.PLains;
          }
        }

        this.tileGraphics.fillStyle(color, 1);
        this.tileGraphics.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);

        this.tileGraphics.lineStyle(1, 0x333333, 0.3);
        this.tileGraphics.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
  }

  private renderUnits(state: GameState): void {
    this.unitContainer.removeAll(true);

    for (const unit of state.units.values()) {
      const definition = unitRegistry.get(unit.definitionId);
      if (!definition) continue;

      let textureKey = 'unit_infantry';
      if (definition.category === 'vehicle') {
        textureKey = 'unit_vehicle';
      } else if (definition.id.includes('whirlwind')) {
        textureKey = 'unit_artillery';
      }

      const x = unit.position.x * TILE_SIZE + TILE_SIZE / 2;
      const y = unit.position.y * TILE_SIZE + TILE_SIZE / 2;

      const sprite = this.add.sprite(x, y, textureKey);
      sprite.setTint(unit.owner === 1 ? 0x4488ff : 0xff4444);

      if (unit.hasActed) {
        sprite.setAlpha(0.5);
      }

      const hpBarWidth = TILE_SIZE - 8;
      const hpBarHeight = 6;
      const hpFraction = unit.currentHp / unit.maxHp;

      const hpBarBg = this.add.graphics();
      hpBarBg.fillStyle(0x000000, 0.7);
      hpBarBg.fillRect(x - hpBarWidth / 2, y + TILE_SIZE / 2 - 12, hpBarWidth, hpBarHeight);

      const hpBar = this.add.graphics();
      hpBar.fillStyle(0x00ff00, 1);
      hpBar.fillRect(x - hpBarWidth / 2, y + TILE_SIZE / 2 - 12, hpBarWidth * hpFraction, hpBarHeight);

      this.unitContainer.add(sprite);
      this.unitContainer.add(hpBarBg);
      this.unitContainer.add(hpBar);
    }

    for (const building of state.buildings.values()) {
      const x = building.position.x * TILE_SIZE + TILE_SIZE / 2;
      const y = building.position.y * TILE_SIZE + TILE_SIZE / 2;

      let textureKey = 'building';
      if (building.terrainId === 'hq') {
        textureKey = 'hq';
      } else if (building.terrainId === 'factory') {
        textureKey = 'factory';
      }

      const sprite = this.add.sprite(x, y, textureKey);
      if (building.owner) {
        sprite.setTint(building.owner === 1 ? 0x4488ff : 0xff4444);
      }
      sprite.setAlpha(0.8);

      this.unitContainer.add(sprite);
    }
  }

  private renderOverlays(): void {
    if (!this.state) return;

    this.overlayGraphics.clear();
    const phase = this.state.phase;

    if (phase === 'ACTION_PREVIEW_MOVE' && this.state.movePreview) {
      for (const tile of this.state.movePreview.reachableTiles) {
        this.overlayGraphics.fillStyle(COLORS.MOVE_PREVIEW, 0.4);
        this.overlayGraphics.fillRect(tile.x * TILE_SIZE, tile.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }

    if (
      (phase === 'ACTION_PREVIEW_ATTACK_FROM_CURRENT' || phase === 'ACTION_PREVIEW_ATTACK_AFTER_MOVE') &&
      this.state.attackPreview
    ) {
      for (const target of this.state.attackPreview.targets) {
        this.overlayGraphics.fillStyle(COLORS.ATTACK_PREVIEW, 0.4);
        this.overlayGraphics.fillRect(target.position.x * TILE_SIZE, target.position.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }

    if (this.state.selectedUnitId) {
      const unit = this.state.units.get(this.state.selectedUnitId);
      if (unit) {
        this.overlayGraphics.lineStyle(3, COLORS.SELECTED, 1);
        this.overlayGraphics.strokeRect(
          unit.position.x * TILE_SIZE + 2,
          unit.position.y * TILE_SIZE + 2,
          TILE_SIZE - 4,
          TILE_SIZE - 4
        );
      }
    }

    if (this.state.selectedBuildingId) {
      const building = this.state.buildings.get(this.state.selectedBuildingId);
      if (building) {
        this.overlayGraphics.lineStyle(3, COLORS.SELECTED, 1);
        this.overlayGraphics.strokeRect(
          building.position.x * TILE_SIZE + 2,
          building.position.y * TILE_SIZE + 2,
          TILE_SIZE - 4,
          TILE_SIZE - 4
        );
      }
    }

    if (phase === 'GAME_OVER') {
      this.overlayGraphics.fillStyle(0x000000, 0.7);
      this.overlayGraphics.fillRect(0, 0, this.cameras.main.width, this.cameras.main.height);

      const winner = this.state.winner;
      const text = winner ? `Player ${winner} Wins!` : 'Game Over';
      const textColor = winner === 1 ? '#4488ff' : '#ff4444';

      const textObj = this.add.text(
        this.cameras.main.width / 2,
        this.cameras.main.height / 2,
        text,
        {
          fontSize: '48px',
          color: textColor,
          fontFamily: 'Arial',
          fontStyle: 'bold',
        }
      );
      textObj.setOrigin(0.5);

      const restartText = this.add.text(
        this.cameras.main.width / 2,
        this.cameras.main.height / 2 + 60,
        'Press ENTER to restart',
        {
          fontSize: '24px',
          color: '#ffffff',
          fontFamily: 'Arial',
        }
      );
      restartText.setOrigin(0.5);
    }
  }

  updateState(state: GameState): void {
    this.state = state;
    this.renderMap(state.map);
    this.renderUnits(state);
    this.renderOverlays();

    if (state.map.length > 0 && state.map[0].length > 0) {
      const mapWidth = state.map[0].length * TILE_SIZE;
      const mapHeight = state.map.length * TILE_SIZE;
      this.cameras.main.setBounds(0, 0, mapWidth, mapHeight);
      this.cameras.main.setZoom(Math.min(
        this.cameras.main.width / mapWidth,
        this.cameras.main.height / mapHeight,
        1
      ));
    }
  }

  shutdown(): void {
    this.unsubscribeFunctions.forEach(unsub => unsub());
    this.unsubscribeFunctions = [];
  }
}

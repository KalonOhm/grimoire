// ============================================================================
// GameScene.ts - Phaser 4.0 Renderer
// ============================================================================
// CURRENTLY DISABLED: This file is not instantiated.
// The game currently renders via React's GameBoard.tsx.
//
// TODO: Wire up Phaser integration when ready to migrate.
// Keep framework-agnostic game logic in src/game/
// ============================================================================
import * as Phaser from 'phaser';
import { GameState, Position, Tile } from '../game/types';
import { gameEngine } from '../game/engine';
import { eventBus } from '../game/events';
import { unitRegistry, terrainRegistry } from '../game/registry';

const TILE_SIZE = 48;

const COLORS = {
  PLAINS: 0x4a7c3f,
  FOREST: 0x2d5a27,
  ROAD: 0x8b7355,
  WATER: 0x1a4d7c,
  IMPASSABLE: 0x3a3a3a,
  HQ: 0x8b0000,
  FACTORY: 0x555555,
  CITY: 0x6b6b6b,
  MOVE_PREVIEW: 0x4488ff,
  MOVE_BLOCKED: 0x444444,
  ATTACK_PREVIEW: 0xff4444,
  SELECTED: 0xffff00,
  UNIT_ALLY: 0x4488ff,
  UNIT_ENEMY: 0xff4444,
  BUILDING_NEUTRAL: 0xffff00,
};

export class GameScene extends Phaser.Scene {
  private tileGraphics!: Phaser.GameObjects.Graphics;
  private unitGraphics!: Phaser.GameObjects.Graphics;
  private buildingGraphics!: Phaser.GameObjects.Graphics;
  private overlayGraphics!: Phaser.GameObjects.Graphics;
  private state: GameState | null = null;
  private unsubscribeFunctions: (() => void)[] = [];

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    console.log('[GameScene] Canvas size:', this.cameras.main.width, 'x', this.cameras.main.height);
    console.log('[GameScene] World size:', this.cameras.main.width, 'x', this.cameras.main.height);

    // DEBUG: Simple red rectangle to verify Graphics API works
    const debug = this.add.graphics();
    debug.fillStyle(0xff0000, 1);
    debug.fillRect(50, 50, 200, 200);
    console.log('[GameScene] Debug rectangle created at (50,50) 200x200');

    // Create separate graphics layers
    this.tileGraphics = this.add.graphics();
    this.unitGraphics = this.add.graphics();
    this.buildingGraphics = this.add.graphics();
    this.overlayGraphics = this.add.graphics();

    this.setupInput();
    this.subscribeToEvents();

    const state = gameEngine.getState();
    if (state) {
      console.log('[GameScene] Initial state received, rendering...');
      console.log('[GameScene] Map size:', state.map.length, 'x', state.map[0]?.length);
      console.log('[GameScene] Units count:', state.units.size);
      console.log('[GameScene] Buildings count:', state.buildings.size);
      this.renderMap(state.map);
      this.renderBuildings(state);
      this.renderUnits(state);
    } else {
      console.log('[GameScene] ERROR: No state received from gameEngine!');
    }

    this.cameras.main.setBackgroundColor('#1a1a2e');

    // Emit scene ready event so App can call updateState
    console.log('[GameScene] Emitting SCENE_READY event');
    eventBus.emit('SCENE_READY', undefined);
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

    // Keyboard controls - issues with Phaser 4 input, commented out until fixed
    // TODO: Fix keyboard event handling in Phaser 4
    // this.input.keyboard?.on('keydown-ESCAPE', () => {
    //   this.handleCancel();
    // });
    // this.input.keyboard?.on('keydown-SPACE', () => {
    //   if (this.state?.phase === 'UNIT_SELECTED') {
    //     gameEngine.endUnitTurn();
    //   }
    // });
    // this.input.keyboard?.on('keydown-ENTER', () => {
    //   if (this.state && this.state.phase !== 'GAME_OVER') {
    //     gameEngine.endTurn();
    //   }
    // });
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
      eventBus.on('BUILDING_SELECTED', () => {
        this.state = gameEngine.getState();
        if (this.state) {
          this.renderBuildings(this.state);
          this.renderOverlays();
        }
      })
    );

    this.unsubscribeFunctions.push(
      eventBus.on('BUILDING_DESELECTED', () => {
        this.state = gameEngine.getState();
        if (this.state) {
          this.renderBuildings(this.state);
          this.renderOverlays();
        }
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
        if (this.state) {
          this.renderUnits(this.state);
          this.renderBuildings(this.state);
        }
        this.renderOverlays();
      })
    );

    this.unsubscribeFunctions.push(
      eventBus.on('UNIT_ATTACKED', () => {
        this.state = gameEngine.getState();
        if (this.state) {
          this.renderUnits(this.state);
        }
        this.renderOverlays();
      })
    );

    this.unsubscribeFunctions.push(
      eventBus.on('UNIT_DESTROYED', () => {
        this.state = gameEngine.getState();
        if (this.state) {
          this.renderUnits(this.state);
        }
        this.renderOverlays();
      })
    );

    this.unsubscribeFunctions.push(
      eventBus.on('TURN_START', () => {
        this.state = gameEngine.getState();
        if (this.state) {
          this.renderUnits(this.state);
        }
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

        let color = COLORS.PLAINS;
        if (terrain) {
          switch (terrain.id) {
            case 'plains': color = COLORS.PLAINS; break;
            case 'forest': color = COLORS.FOREST; break;
            case 'road': color = COLORS.ROAD; break;
            case 'water': color = COLORS.WATER; break;
            case 'impassable': color = COLORS.IMPASSABLE; break;
            default: color = COLORS.PLAINS;
          }
        }

        this.tileGraphics.fillStyle(color, 1);
        this.tileGraphics.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);

        this.tileGraphics.lineStyle(1, 0x333333, 0.3);
        this.tileGraphics.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
  }

  private renderBuildings(state: GameState): void {
    this.buildingGraphics.clear();
    console.log('[renderBuildings] Starting render, building count:', state.buildings.size);

    for (const building of state.buildings.values()) {
      console.log('[renderBuildings] Rendering building:', building.id, 'at', building.position, 'type:', building.buildingType);
      const centerX = building.position.x * TILE_SIZE + TILE_SIZE / 2;
      const centerY = building.position.y * TILE_SIZE + TILE_SIZE / 2;
      const size = TILE_SIZE * 0.4;

      let color = COLORS.BUILDING_NEUTRAL;
      if (building.owner === 1) {
        color = COLORS.UNIT_ALLY;
      } else if (building.owner === 2) {
        color = COLORS.UNIT_ENEMY;
      }

      this.buildingGraphics.fillStyle(color, 0.8);

      const topPoint = { x: centerX, y: centerY - size };
      const bottomLeft = { x: centerX - size, y: centerY + size };
      const bottomRight = { x: centerX + size, y: centerY + size };

      this.buildingGraphics.fillTriangle(
        topPoint.x, topPoint.y,
        bottomLeft.x, bottomLeft.y,
        bottomRight.x, bottomRight.y
      );

      this.buildingGraphics.lineStyle(2, 0x000000, 0.5);
      this.buildingGraphics.strokeTriangle(
        topPoint.x, topPoint.y,
        bottomLeft.x, bottomLeft.y,
        bottomRight.x, bottomRight.y
      );
    }
  }

  private renderUnits(state: GameState): void {
    this.unitGraphics.clear();

    for (const unit of state.units.values()) {
      const definition = unitRegistry.get(unit.definitionId);
      if (!definition) continue;

      const tileCenterX = unit.position.x * TILE_SIZE + TILE_SIZE / 2;
      const tileCenterY = unit.position.y * TILE_SIZE + TILE_SIZE / 2;

      const unitSize = TILE_SIZE * 0.75;
      const halfSize = unitSize / 2;

      const unitColor = unit.owner === 1 ? COLORS.UNIT_ALLY : COLORS.UNIT_ENEMY;
      const outlineColor = unit.owner === 1 ? 0x2266cc : 0xcc2222;

      this.unitGraphics.fillStyle(unitColor, 1);
      this.unitGraphics.fillRect(tileCenterX - halfSize, tileCenterY - halfSize, unitSize, unitSize);

      this.unitGraphics.lineStyle(2, outlineColor, 1);
      this.unitGraphics.strokeRect(tileCenterX - halfSize, tileCenterY - halfSize, unitSize, unitSize);

      const letter = definition.name.charAt(0).toUpperCase();
      const text = this.add.text(tileCenterX, tileCenterY - 6, letter, {
        fontSize: '24px',
        fontFamily: 'Arial',
        fontStyle: 'bold',
        color: '#ffffff'
      });
      text.setOrigin(0.5);

      const hpValue = Math.max(1, Math.round((unit.currentHp / unit.maxHp) * 10));
      const hpText = this.add.text(tileCenterX, tileCenterY + 14, hpValue.toString(), {
        fontSize: '14px',
        fontFamily: 'Arial',
        fontStyle: 'bold',
        color: '#ffffff'
      });
      hpText.setOrigin(0.5);
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
      for (const tile of this.state.movePreview.blockedTiles) {
        const x = tile.x * TILE_SIZE;
        const y = tile.y * TILE_SIZE;
        this.overlayGraphics.fillStyle(COLORS.MOVE_BLOCKED, 0.3);
        this.overlayGraphics.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        this.overlayGraphics.lineStyle(2, 0x222222, 0.8);
        this.overlayGraphics.beginPath();
        this.overlayGraphics.moveTo(x, y);
        this.overlayGraphics.lineTo(x + TILE_SIZE, y + TILE_SIZE);
        this.overlayGraphics.moveTo(x + TILE_SIZE, y);
        this.overlayGraphics.lineTo(x, y + TILE_SIZE);
        this.overlayGraphics.strokePath();
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
    
    console.log('[GameScene.updateState] Phase:', state.phase);
    console.log('[GameScene.updateState] Map:', state.map.length, 'x', state.map[0]?.length);
    console.log('[GameScene.updateState] Units:', state.units.size);
    console.log('[GameScene.updateState] Buildings:', state.buildings.size);

    this.renderMap(state.map);
    this.renderBuildings(state);
    this.renderUnits(state);
    this.renderOverlays();

    if (state.map.length > 0 && state.map[0].length > 0) {
      const mapWidth = state.map[0].length * TILE_SIZE;
      const mapHeight = state.map.length * TILE_SIZE;
      
      this.cameras.main.setBounds(0, 0, mapWidth, mapHeight);
      
      const zoom = Math.min(
        this.cameras.main.width / mapWidth,
        this.cameras.main.height / mapHeight,
        1
      );
      
      console.log('[GameScene.updateState] Camera:', {
        viewWidth: this.cameras.main.width,
        viewHeight: this.cameras.main.height,
        mapWidth,
        mapHeight,
        zoom
      });
      
      this.cameras.main.setZoom(Math.max(zoom, 0.1));
    }
  }

  shutdown(): void {
    this.unsubscribeFunctions.forEach(unsub => unsub());
    this.unsubscribeFunctions = [];
  }
}

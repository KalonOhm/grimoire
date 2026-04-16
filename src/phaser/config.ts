// ============================================================================
// config.ts - Phaser Configuration
// ============================================================================
// CURRENTLY DISABLED: This file is not instantiated.
// The game currently renders via React's GameBoard.tsx.
// ============================================================================
import * as Phaser from 'phaser';
import { GameScene } from './GameScene';

export function createGameConfig(parent: string | HTMLElement): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    width: 1024,
    height: 768,
    backgroundColor: '#1a1a2e',
    scene: [GameScene],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    input: {
      keyboard: true,
      mouse: true,
    },
  };
}

export { GameScene };

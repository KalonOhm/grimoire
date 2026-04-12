import { useEffect, useState } from 'react';
import { eventBus, EventName, EventMap } from '../game/events';
import { gameEngine } from '../game/engine';

export function useGameEvent<K extends EventName>(
  event: K,
  callback: (payload: EventMap[K]) => void
): void {
  useEffect(() => {
    const unsubscribe = eventBus.on(event, callback);
    return unsubscribe;
  }, [event, callback]);
}

export function useGameState<T>(getValue: () => T, deps: unknown[] = []): T {
  const [value, setValue] = useState<T>(getValue);

  useEffect(() => {
    const checkValue = () => {
      const newValue = getValue();
      setValue(newValue);
    };

    checkValue();

    const unsubscribers = [
      eventBus.on('PHASE_CHANGE', checkValue),
      eventBus.on('UNIT_SELECTED', checkValue),
      eventBus.on('UNIT_DESELECTED', checkValue),
      eventBus.on('UNIT_MOVED', checkValue),
      eventBus.on('UNIT_ATTACKED', checkValue),
      eventBus.on('UNIT_DESTROYED', checkValue),
      eventBus.on('UNIT_REFRESHED', checkValue),
      eventBus.on('TURN_START', checkValue),
      eventBus.on('TURN_END', checkValue),
      eventBus.on('GAME_OVER', checkValue),
      eventBus.on('CREDITS_CHANGED', checkValue),
    ];

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [...deps]);

  return value;
}

export function usePhase(): string {
  return useGameState(() => {
    return gameEngine.getState()?.phase || 'BOOT';
  });
}

export function useActivePlayer(): number {
  return useGameState(() => {
    return gameEngine.getState()?.activePlayer || 1;
  });
}

export function useCurrentTurn(): number {
  return useGameState(() => {
    return gameEngine.getState()?.currentTurn || 1;
  });
}

export function useSelectedUnit(): string | null {
  return useGameState(() => {
    return gameEngine.getState()?.selectedUnitId || null;
  });
}

export function useCredits(player: number): number {
  return useGameState(() => {
    const state = gameEngine.getState();
    return state?.players[player as 1 | 2]?.credits || 0;
  }, [player]);
}

export function useWinner(): number | null {
  return useGameState(() => {
    return gameEngine.getState()?.winner || null;
  });
}

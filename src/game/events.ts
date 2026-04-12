import { Position, PlayerId, GamePhase, CombatResult, Unit, Building } from './types';

type EventCallback<T = unknown> = (payload: T) => void;

interface EventMap {
  PHASE_CHANGE: { from: GamePhase; to: GamePhase };
  UNIT_SELECTED: { unitId: string; unit: Unit };
  UNIT_DESELECTED: { unitId: string };
  BUILDING_SELECTED: { buildingId: string; building: Building };
  BUILDING_DESELECTED: { buildingId: string };
  MOVE_PREVIEW_SHOWN: { unitId: string; reachableTiles: Position[] };
  MOVE_PREVIEW_HIDDEN: { unitId: string };
  MOVE_DESTINATION_SELECTED: { unitId: string; destination: Position; path: Position[] };
  ATTACK_PREVIEW_SHOWN: { unitId: string; targets: Array<{ unitId: string; position: Position }> };
  ATTACK_PREVIEW_HIDDEN: { unitId: string };
  UNIT_MOVED: { unitId: string; from: Position; to: Position };
  UNIT_ATTACKED: { combat: CombatResult };
  UNIT_DESTROYED: { unitId: string };
  BUILDING_CAPTURED: { buildingId: string; newOwner: PlayerId };
  UNIT_CREATED: { unit: Unit };
  TURN_START: { player: PlayerId; turn: number };
  TURN_END: { player: PlayerId };
  INCOME_RECEIVED: { player: PlayerId; amount: number };
  UNIT_REFRESHED: { unitId: string };
  GAME_OVER: { winner: PlayerId };
  CREDITS_CHANGED: { player: PlayerId; credits: number };
  UI_ACTION_REQUESTED: { action: string; context: unknown };
  GAME_STATE_FULL_UPDATE: Record<string, unknown>;
}

type EventName = keyof EventMap;

class EventBus {
  private listeners: Map<EventName, Set<EventCallback<unknown>>> = new Map();

  on<K extends EventName>(event: K, callback: EventCallback<EventMap[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback as EventCallback<unknown>);

    return () => {
      this.listeners.get(event)?.delete(callback as EventCallback<unknown>);
    };
  }

  off<K extends EventName>(event: K, callback: EventCallback<EventMap[K]>): void {
    this.listeners.get(event)?.delete(callback as EventCallback<unknown>);
  }

  emit<K extends EventName>(event: K, payload: EventMap[K]): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((cb) => cb(payload));
    }
  }

  once<K extends EventName>(event: K, callback: EventCallback<EventMap[K]>): () => void {
    const wrapper: EventCallback<EventMap[K]> = (payload) => {
      this.off(event, wrapper);
      callback(payload);
    };
    return this.on(event, wrapper);
  }
}

export const eventBus = new EventBus();

export type { EventName, EventMap };

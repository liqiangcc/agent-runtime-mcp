/**
 * In-process event bus for Console-observed sends. Every successful or
 * ambiguous mutation emits exactly one event; rejected sends emit none.
 * Browser push / history transport is owned by a later Task (#62) — this
 * module is intentionally process-local with no network surface.
 */

import type { TerminalControl } from './mcp-client.js';

export type TransportResult = 'delivered' | 'ambiguous';

export interface UserTurnEvent {
  type: 'user-turn';
  channel_id: string;
  text: string;
  submit: boolean;
  sent_at: string;
  transport_result: TransportResult;
}

export interface ControlEvent {
  type: 'control';
  channel_id: string;
  control: TerminalControl;
  sent_at: string;
  transport_result: TransportResult;
}

export type ConsoleEvent = UserTurnEvent | ControlEvent;

export type ConsoleEventListener = (event: ConsoleEvent) => void;

const MAX_LISTENERS = 32;

export class ConsoleEventBus {
  private readonly listeners = new Set<ConsoleEventListener>();

  subscribe(listener: ConsoleEventListener): () => void {
    if (this.listeners.size >= MAX_LISTENERS) {
      throw new Error('console event bus listener limit reached');
    }
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: ConsoleEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch {
        // A faulty listener must not break mutation reporting.
      }
    }
  }
}

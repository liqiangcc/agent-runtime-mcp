export type BackendKind = 'tmux';
export type ChannelState = 'available' | 'unavailable' | 'unknown';
export type ChannelCapability = 'read' | 'write-text' | 'control';

export interface Channel {
  channel_id: string;
  backend_kind: BackendKind;
  backend_locator?: string;
  state: ChannelState;
  capabilities: ChannelCapability[];
  title?: string;
  cwd?: string;
  last_activity?: string;
}

export interface ChannelRead {
  channel_id: string;
  captured_at: string;
  text: string;
  truncated: boolean;
  line_count: number;
  byte_count: number;
}

export interface ReadChannelOptions {
  lines?: number;
  bytes?: number;
}

export interface BackendHealth {
  backend_kind: BackendKind;
  available: boolean;
  detail?: string;
}

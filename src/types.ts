export type BackendKind = 'tmux';
export type ChannelState = 'available' | 'unavailable' | 'unknown';
export type ChannelCapability = 'read' | 'write-text' | 'control';
export type TerminalControl = 'ENTER' | 'INTERRUPT' | 'ESCAPE';

export interface TmuxChannelMetadata {
  session_name: string;
  window_id: string;
  window_index: number;
  pane_id: string;
  pane_index: number;
}

export interface ChannelBackendMetadata {
  tmux?: TmuxChannelMetadata;
}

export interface Channel {
  channel_id: string;
  backend_kind: BackendKind;
  backend_locator?: string;
  state: ChannelState;
  capabilities: ChannelCapability[];
  title?: string;
  cwd?: string;
  last_activity?: string;
  backend_metadata?: ChannelBackendMetadata;
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

export interface WriteTextOptions {
  submit: boolean;
}

export interface WriteTextResult {
  channel_id: string;
  submitted: boolean;
}

export interface SendControlResult {
  channel_id: string;
  control: TerminalControl;
}

export interface BackendHealth {
  backend_kind: BackendKind;
  available: boolean;
  detail?: string;
}

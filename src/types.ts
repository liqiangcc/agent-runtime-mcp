export type BackendKind = 'tmux';
export type ChannelState = 'available' | 'unavailable' | 'unknown';
export type ChannelCapability = 'read' | 'write-text' | 'control' | 'observe';
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

export type ObservationModel = 'snapshot_change';
export type WaitReason = 'output_idle' | 'timeout' | 'channel_closed';
export interface ObservationLease {
  cursor: string;
  channel_instance: string;
  model: ObservationModel;
  issued_at: string;
  valid_until: string;
  continuity: 'complete';
}
export interface WaitChannelEventInput {
  channel_id: string;
  after_cursor: string;
  idle_ms?: number;
  timeout_ms?: number;
}
export interface WaitChannelEventResult {
  reason: WaitReason;
  channel_id: string;
  channel_instance: string;
  observed_at: string;
  next_cursor: string;
  activity_observed: boolean;
  first_activity_at?: string;
  last_activity_at?: string;
  observation_model: ObservationModel;
  idle_ms: number;
  timeout_ms: number;
}

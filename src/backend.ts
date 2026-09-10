import type {
  BackendHealth,
  Channel,
  ChannelRead,
  ReadChannelOptions,
  SendControlResult,
  TerminalControl,
  WriteTextOptions,
  WriteTextResult,
} from './types.js';

export interface ChannelBackend {
  listChannels(): Promise<Channel[]>;
  getChannel(channelId: string): Promise<Channel>;
  readChannel(channelId: string, options?: ReadChannelOptions): Promise<ChannelRead>;
  writeText(channelId: string, text: string, options: WriteTextOptions): Promise<WriteTextResult>;
  sendControl(channelId: string, control: TerminalControl): Promise<SendControlResult>;
  health(): Promise<BackendHealth>;
  observeChannel?(channelId: string): Promise<{ channel: Channel; observation: import('./types.js').ObservationLease }>;
  waitChannelEvent?(input: import('./types.js').WaitChannelEventInput, signal?: AbortSignal): Promise<import('./types.js').WaitChannelEventResult>;
}

import type { BackendHealth, Channel, ChannelRead, ReadChannelOptions } from './types.js';

export interface ChannelBackend {
  listChannels(): Promise<Channel[]>;
  getChannel(channelId: string): Promise<Channel>;
  readChannel(channelId: string, options?: ReadChannelOptions): Promise<ChannelRead>;
  health(): Promise<BackendHealth>;
}

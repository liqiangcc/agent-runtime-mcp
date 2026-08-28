import type { ChannelBackend } from './backend.js';
import type { ReadChannelOptions } from './types.js';

export async function listChannels(backend: ChannelBackend) {
  return { channels: await backend.listChannels() };
}

export async function getChannel(backend: ChannelBackend, channelId: string) {
  return { channel: await backend.getChannel(channelId) };
}

export async function readChannel(backend: ChannelBackend, channelId: string, options: ReadChannelOptions = {}) {
  return { read: await backend.readChannel(channelId, options) };
}

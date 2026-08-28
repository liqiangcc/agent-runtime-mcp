import type { ChannelBackend } from './backend.js';
import { validateOrdinaryText, validateTerminalControl } from './input.js';
import type { ReadChannelOptions, TerminalControl } from './types.js';

export async function listChannels(backend: ChannelBackend) {
  return { channels: await backend.listChannels() };
}

export async function getChannel(backend: ChannelBackend, channelId: string) {
  return { channel: await backend.getChannel(channelId) };
}

export async function readChannel(backend: ChannelBackend, channelId: string, options: ReadChannelOptions = {}) {
  return { read: await backend.readChannel(channelId, options) };
}

export async function writeText(backend: ChannelBackend, channelId: string, text: string, submit: boolean) {
  validateOrdinaryText(text);
  return backend.writeText(channelId, text, { submit });
}

export async function sendControl(backend: ChannelBackend, channelId: string, control: TerminalControl) {
  validateTerminalControl(control);
  return backend.sendControl(channelId, control);
}

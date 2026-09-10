import type { ChannelBackend } from './backend.js';
import { ChannelError } from './errors.js';
import { validateOrdinaryText, validateTerminalControl } from './input.js';
import type { ReadChannelOptions, TerminalControl, WaitChannelEventInput } from './types.js';

export async function listChannels(backend: ChannelBackend) {
  return { channels: await backend.listChannels() };
}

export async function getChannel(backend: ChannelBackend, channelId: string, observe = false) {
  const channel = await backend.getChannel(channelId);
  if (!observe) return { channel };
  if (!backend.observeChannel) throw new ChannelError('OBSERVATION_UNSUPPORTED', 'Observation is not supported by this backend');
  const observed = await backend.observeChannel(channelId);
  return { channel: observed.channel, observation: observed.observation };
}

export async function readChannel(backend: ChannelBackend, channelId: string, options: ReadChannelOptions = {}) {
  return { read: await backend.readChannel(channelId, options) };
}

export async function health(backend: ChannelBackend) {
  return { health: await backend.health() };
}

export async function writeText(backend: ChannelBackend, channelId: string, text: string, submit: boolean) {
  validateOrdinaryText(text);
  return backend.writeText(channelId, text, { submit });
}

export async function sendControl(backend: ChannelBackend, channelId: string, control: TerminalControl) {
  validateTerminalControl(control);
  return backend.sendControl(channelId, control);
}

export async function waitChannelEvent(backend: ChannelBackend, input: WaitChannelEventInput, signal?: AbortSignal) {
  if (!backend.waitChannelEvent) throw new ChannelError('OBSERVATION_UNSUPPORTED', 'Observation is not supported by this backend');
  return backend.waitChannelEvent(input, signal);
}

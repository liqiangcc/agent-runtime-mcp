import { describe, expect, it } from 'vitest';
import type { ChannelBackend } from '../../src/backend.js';
import { getChannel, listChannels, readChannel } from '../../src/handlers.js';
import { MVP_001_TOOL_NAMES } from '../../src/mcp.js';
import type { BackendHealth, Channel, ChannelRead, ReadChannelOptions } from '../../src/types.js';

class FakeBackend implements ChannelBackend {
  readonly channel: Channel = {
    channel_id: 'tmux:scope:1',
    backend_kind: 'tmux',
    state: 'available',
    capabilities: ['read'],
    title: 'fake',
  };

  async listChannels(): Promise<Channel[]> {
    return [this.channel];
  }

  async getChannel(channelId: string): Promise<Channel> {
    return { ...this.channel, channel_id: channelId };
  }

  async readChannel(channelId: string, options?: ReadChannelOptions): Promise<ChannelRead> {
    const text = `lines=${options?.lines ?? 'default'} bytes=${options?.bytes ?? 'default'}`;
    return {
      channel_id: channelId,
      captured_at: '2026-08-28T00:00:00.000Z',
      text,
      truncated: false,
      line_count: 1,
      byte_count: Buffer.byteLength(text),
    };
  }

  async health(): Promise<BackendHealth> {
    return { backend_kind: 'tmux', available: true };
  }
}

describe('MVP-001 handlers', () => {
  it('lists channels through the backend abstraction', async () => {
    const payload = await listChannels(new FakeBackend());
    expect(payload.channels).toHaveLength(1);
    expect(payload.channels[0].capabilities).toEqual(['read']);
  });

  it('gets one channel by opaque channel id', async () => {
    const payload = await getChannel(new FakeBackend(), 'tmux:opaque:7');
    expect(payload.channel.channel_id).toBe('tmux:opaque:7');
  });

  it('passes read bounds to the backend', async () => {
    const payload = await readChannel(new FakeBackend(), 'tmux:opaque:7', { lines: 9, bytes: 123 });
    expect(payload.read.text).toBe('lines=9 bytes=123');
  });

  it('registers only the frozen read-only Phase-1 tool names', () => {
    expect(MVP_001_TOOL_NAMES).toEqual(['list_channels', 'get_channel', 'read_channel']);
    expect(MVP_001_TOOL_NAMES).not.toContain('write_text');
    expect(MVP_001_TOOL_NAMES).not.toContain('send_control');
    expect(MVP_001_TOOL_NAMES).not.toContain('tmux_command');
  });
});

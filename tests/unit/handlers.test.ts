import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ChannelBackend } from '../../src/backend.js';
import { ChannelError } from '../../src/errors.js';
import { getChannel, health, listChannels, readChannel, sendControl, writeText } from '../../src/handlers.js';
import {
  HEALTH_TOOL_ANNOTATIONS,
  MUTATION_TOOL_ANNOTATIONS,
  MVP_001_TOOL_NAMES,
  MVP_002_5_TOOL_NAMES,
  MVP_002_TOOL_NAMES,
} from '../../src/mcp.js';
import type {
  BackendHealth,
  Channel,
  ChannelRead,
  ReadChannelOptions,
  SendControlResult,
  TerminalControl,
  WriteTextOptions,
  WriteTextResult,
} from '../../src/types.js';

class FakeBackend implements ChannelBackend {
  readonly channel: Channel = {
    channel_id: 'tmux:scope:1',
    backend_kind: 'tmux',
    state: 'available',
    capabilities: ['read', 'write-text', 'control'],
    title: 'fake',
  };
  listCalls = 0;
  writeCalls = 0;
  controlCalls = 0;
  healthCalls = 0;

  async listChannels(): Promise<Channel[]> {
    this.listCalls += 1;
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

  async writeText(channelId: string, _text: string, options: WriteTextOptions): Promise<WriteTextResult> {
    this.writeCalls += 1;
    return { channel_id: channelId, submitted: options.submit };
  }

  async sendControl(channelId: string, control: TerminalControl): Promise<SendControlResult> {
    this.controlCalls += 1;
    return { channel_id: channelId, control };
  }

  async health(): Promise<BackendHealth> {
    this.healthCalls += 1;
    return { backend_kind: 'tmux', available: true, detail: 'fixture' };
  }
}

describe('Channel handlers', () => {
  it('keeps Phase-1 observation handlers compatible', async () => {
    const backend = new FakeBackend();
    const listed = await listChannels(backend);
    const inspected = await getChannel(backend, 'tmux:opaque:7');
    const read = await readChannel(backend, 'tmux:opaque:7', { lines: 9, bytes: 123 });

    assert.equal(listed.channels.length, 1);
    assert.deepEqual(listed.channels[0].capabilities, ['read', 'write-text', 'control']);
    assert.equal(inspected.channel.channel_id, 'tmux:opaque:7');
    assert.equal(read.read.text, 'lines=9 bytes=123');
  });

  it('returns mechanical write/control acknowledgements through the backend abstraction', async () => {
    const backend = new FakeBackend();
    assert.deepEqual(await writeText(backend, 'tmux:opaque:7', 'hello\nworld\t世界', true), {
      channel_id: 'tmux:opaque:7',
      submitted: true,
    });
    assert.deepEqual(await sendControl(backend, 'tmux:opaque:7', 'ESCAPE'), {
      channel_id: 'tmux:opaque:7',
      control: 'ESCAPE',
    });
  });

  it('returns backend health directly without consulting Channel inventory', async () => {
    const backend = new FakeBackend();

    assert.deepEqual(await health(backend), {
      health: { backend_kind: 'tmux', available: true, detail: 'fixture' },
    });
    assert.equal(backend.healthCalls, 1);
    assert.equal(backend.listCalls, 0);
  });

  it('rejects ordinary-text control characters before invoking the backend mutation', async () => {
    const backend = new FakeBackend();
    await assert.rejects(writeText(backend, 'tmux:opaque:7', 'bad\rtext', false), ChannelError);
    assert.equal(backend.writeCalls, 0);
  });

  it('adds exactly public health after the accepted Phase-2 tools with read-only semantics', () => {
    assert.deepEqual(MVP_001_TOOL_NAMES, ['list_channels', 'get_channel', 'read_channel']);
    assert.deepEqual(MVP_002_TOOL_NAMES, ['list_channels', 'get_channel', 'read_channel', 'write_text', 'send_control']);
    assert.deepEqual(MVP_002_5_TOOL_NAMES, [
      'list_channels',
      'get_channel',
      'read_channel',
      'write_text',
      'send_control',
      'health',
    ]);
    assert.deepEqual(MUTATION_TOOL_ANNOTATIONS, {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
    });
    assert.deepEqual(HEALTH_TOOL_ANNOTATIONS, {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    });
    assert.equal(MVP_002_TOOL_NAMES.includes('health' as never), false);
    assert.equal(MVP_002_5_TOOL_NAMES.includes('tmux_command' as never), false);
  });
});

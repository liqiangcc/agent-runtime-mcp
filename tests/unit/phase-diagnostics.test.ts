import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PHASE_DIAGNOSTICS_SCHEMA,
  createPhaseDiagnostics,
  type PhaseDiagnosticRecord,
} from '../../src/phase-diagnostics.js';

function records() {
  const emitted: PhaseDiagnosticRecord[] = [];
  return { emitted, sink: { emit: (record: PhaseDiagnosticRecord) => emitted.push(record) } };
}

test('phase diagnostics are silent unless the exact opt-in flag is set', () => {
  const { emitted, sink } = records();
  const diagnostics = createPhaseDiagnostics({ AGENT_RUNTIME_MCP_PHASE_DIAGNOSTICS: 'true' }, process.stderr, sink);
  const span = diagnostics.start('health', 1);
  span.methodEnd('success');
  assert.equal(diagnostics.enabled, false);
  assert.deepEqual(emitted, []);
});

test('enabled records are bounded, ordered, correlated and fingerprinted without raw ids', () => {
  const { emitted, sink } = records();
  const diagnostics = createPhaseDiagnostics({ AGENT_RUNTIME_MCP_PHASE_DIAGNOSTICS: '1' }, process.stderr, sink);
  const first = diagnostics.start('read_channel', 'sensitive-request-id');
  first.backendStart({ requested_lines: 12, requested_bytes: 1000 });
  first.backendEnd('success', { requested_lines: 12, requested_bytes: 1000, returned_line_count: 2, returned_byte_count: 12, truncated: false });
  first.methodEnd('success');
  const second = diagnostics.start('health', 'sensitive-request-id');
  second.methodEnd('error', 'BACKEND_UNAVAILABLE');
  const third = diagnostics.start('health', 1);
  third.methodEnd('success');

  assert.equal(emitted.length, 8);
  assert.deepEqual(emitted.slice(0, 4).map((record) => record.phase), ['method_start', 'backend_start', 'backend_end', 'method_end']);
  assert.deepEqual(emitted.slice(4, 6).map((record) => record.phase), ['method_start', 'method_end']);
  assert.notEqual(emitted[0].correlation_id, emitted[4].correlation_id);
  assert.notEqual(emitted[0].rpc_id_fingerprint, emitted[6].rpc_id_fingerprint);
  assert.equal(emitted[0].correlation_id, emitted[3].correlation_id);
  assert.equal(emitted[0].rpc_id_fingerprint, emitted[4].rpc_id_fingerprint);
  assert.equal(emitted[0].rpc_id_fingerprint.length, 24);
  assert.equal(JSON.stringify(emitted).includes('sensitive-request-id'), false);
  assert.ok(emitted.every((record) => record.schema === PHASE_DIAGNOSTICS_SCHEMA && Number.isFinite(record.elapsed_ms) && record.elapsed_ms >= 0));
  assert.equal(emitted[2].returned_byte_count, 12);
  assert.equal(emitted[5].error_code, 'BACKEND_UNAVAILABLE');
  assert.equal(Object.hasOwn(emitted[5], 'message'), false);
});

import { createHash, randomBytes } from 'node:crypto';
import type { Writable } from 'node:stream';

export const PHASE_DIAGNOSTICS_ENV = 'AGENT_RUNTIME_MCP_PHASE_DIAGNOSTICS';
export const PHASE_DIAGNOSTICS_SCHEMA = 'agent-runtime-mcp.phase.v1';

export const DIAGNOSTIC_METHODS = [
  'list_channels',
  'get_channel',
  'read_channel',
  'write_text',
  'send_control',
  'health',
  'wait_channel_event',
] as const;
export type DiagnosticMethod = (typeof DIAGNOSTIC_METHODS)[number];
export type DiagnosticPhase = 'method_start' | 'backend_start' | 'backend_end' | 'method_end';
export type DiagnosticOutcome = 'success' | 'error';

export interface ReadShape {
  requested_lines?: number;
  requested_bytes?: number;
  returned_line_count?: number;
  returned_byte_count?: number;
  truncated?: boolean;
}

export interface PhaseDiagnosticRecord {
  schema: typeof PHASE_DIAGNOSTICS_SCHEMA;
  phase: DiagnosticPhase;
  correlation_id: string;
  rpc_id_fingerprint: string;
  method: DiagnosticMethod;
  wall_time_utc: string;
  elapsed_ms: number;
  outcome?: DiagnosticOutcome;
  error_code?: string;
  requested_lines?: number;
  requested_bytes?: number;
  returned_line_count?: number;
  returned_byte_count?: number;
  truncated?: boolean;
}

export interface PhaseDiagnosticSink {
  emit(record: PhaseDiagnosticRecord): void;
}

export interface PhaseSpan {
  backendStart(shape?: ReadShape): void;
  backendEnd(outcome: DiagnosticOutcome, shape?: ReadShape, errorCode?: string): void;
  methodEnd(outcome: DiagnosticOutcome, errorCode?: string): void;
}

export interface PhaseDiagnostics {
  readonly enabled: boolean;
  start(method: DiagnosticMethod, requestId: unknown): PhaseSpan;
}

const ERROR_CODES = new Set([
  'CHANNEL_NOT_FOUND',
  'CHANNEL_UNAVAILABLE',
  'BACKEND_UNAVAILABLE',
  'BACKEND_OPERATION_FAILED',
  'INVALID_ARGUMENT',
  'CAPABILITY_UNSUPPORTED',
  'PERMISSION_DENIED',
  'TIMEOUT',
  'AUTHENTICATION_REQUIRED',
  'OBSERVATION_UNSUPPORTED',
  'CURSOR_INVALID',
  'CURSOR_EXPIRED',
  'OBSERVATION_GAP',
  'CHANNEL_INSTANCE_CHANGED',
  'WAITER_LIMIT',
  'RESOURCE_EXHAUSTED',
  'WAIT_ARGUMENT_INVALID',
  'INTERNAL_ERROR',
]);

function fingerprint(requestId: unknown): string {
  const type = requestId === null ? 'null' : typeof requestId;
  return createHash('sha256').update(`${type}:${String(requestId)}`, 'utf8').digest('hex').slice(0, 24);
}

function correlationId(): string {
  return randomBytes(12).toString('hex');
}

function finiteMs(value: number): number {
  return Number.isFinite(value) && value >= 0 ? Number(value.toFixed(3)) : 0;
}

function safeShape(shape: ReadShape | undefined): ReadShape {
  if (!shape) return {};
  const result: ReadShape = {};
  for (const key of ['requested_lines', 'requested_bytes', 'returned_line_count', 'returned_byte_count'] as const) {
    const value = shape[key];
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) result[key] = value;
  }
  if (typeof shape.truncated === 'boolean') result.truncated = shape.truncated;
  return result;
}

function safeErrorCode(code: string | undefined): string | undefined {
  return code && ERROR_CODES.has(code) ? code : undefined;
}

class StderrSink implements PhaseDiagnosticSink {
  constructor(private readonly stderr: Writable) {}

  emit(record: PhaseDiagnosticRecord): void {
    try {
      this.stderr.write(`${JSON.stringify(record)}\n`);
    } catch {
      // Diagnostics must never alter Tool behavior when stderr is unavailable.
    }
  }
}

class DisabledSpan implements PhaseSpan {
  backendStart(): void {}
  backendEnd(): void {}
  methodEnd(): void {}
}

export function createPhaseDiagnostics(
  env: NodeJS.ProcessEnv = process.env,
  stderr: Writable = process.stderr,
  sink?: PhaseDiagnosticSink,
): PhaseDiagnostics {
  const enabled = env[PHASE_DIAGNOSTICS_ENV] === '1';
  if (!enabled) return { enabled: false, start: () => new DisabledSpan() };
  const output = sink ?? new StderrSink(stderr);
  return {
    enabled: true,
    start(method, requestId): PhaseSpan {
      let id: string;
      try {
        id = correlationId();
      } catch {
        return new DisabledSpan();
      }
      const rpcFingerprint = fingerprint(requestId);
      const started = process.hrtime.bigint();
      const emit = (phase: DiagnosticPhase, outcome?: DiagnosticOutcome, shape?: ReadShape, errorCode?: string): void => {
        const record: PhaseDiagnosticRecord = {
          schema: PHASE_DIAGNOSTICS_SCHEMA,
          phase,
          correlation_id: id,
          rpc_id_fingerprint: rpcFingerprint,
          method,
          wall_time_utc: new Date().toISOString(),
          elapsed_ms: finiteMs(Number(process.hrtime.bigint() - started) / 1_000_000),
          ...(outcome ? { outcome } : {}),
          ...(safeErrorCode(errorCode) ? { error_code: safeErrorCode(errorCode) } : {}),
          ...safeShape(shape),
        };
        try {
          output.emit(record);
        } catch {
          // An injected sink is untrusted too; diagnostics remain best effort.
        }
      };
      emit('method_start');
      return {
        backendStart: (shape) => emit('backend_start', undefined, shape),
        backendEnd: (outcome, shape, errorCode) => emit('backend_end', outcome, shape, errorCode),
        methodEnd: (outcome, errorCode) => emit('method_end', outcome, undefined, errorCode),
      };
    },
  };
}

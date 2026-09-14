/**
 * Structured logging for the Console. Records are single JSON lines on stderr.
 * Only scalar fields are emitted; non-scalar values collapse to a type tag so
 * terminal payloads can never be written to the log (docs/security.md T5/S10).
 */

export type LogSink = (line: string) => void;
export type Logger = (event: string, fields?: Record<string, unknown>) => void;

function defaultSink(line: string): void {
  process.stderr.write(`${line}\n`);
}

export function createLogger(sink: LogSink = defaultSink): Logger {
  return (event, fields = {}) => {
    const record: Record<string, unknown> = { ts: new Date().toISOString(), event };
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        record[key] = value;
      } else {
        record[key] = `[${Array.isArray(value) ? 'array' : typeof value}]`;
      }
    }
    sink(JSON.stringify(record));
  };
}

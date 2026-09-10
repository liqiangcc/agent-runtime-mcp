export interface StdioShutdownHandle { close(): Promise<void>; }

/** Install one idempotent shutdown path for stdio EOF and process signals. */
export function installStdioShutdown(handle: StdioShutdownHandle, stdin: NodeJS.ReadableStream = process.stdin, signalSource: NodeJS.Process = process): () => void {
  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    void handle.close();
  };
  stdin.once('end', close);
  signalSource.once('SIGINT', close);
  signalSource.once('SIGTERM', close);
  return () => {
    stdin.off('end', close);
    signalSource.off('SIGINT', close);
    signalSource.off('SIGTERM', close);
  };
}

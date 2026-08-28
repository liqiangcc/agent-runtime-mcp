import { appendFileSync, writeFileSync } from 'node:fs';

const outputPath = process.argv[2];
if (!outputPath) {
  throw new Error('terminal-recorder requires an output path');
}

writeFileSync(outputPath, Buffer.alloc(0));
if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') {
  process.stdin.setRawMode(true);
}
process.stdin.resume();
process.stdout.write('READY\n');

process.stdin.on('data', (chunk) => {
  appendFileSync(outputPath, chunk);
});

function shutdown() {
  try {
    if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') {
      process.stdin.setRawMode(false);
    }
  } finally {
    process.exit(0);
  }
}

process.on('SIGTERM', shutdown);
process.on('SIGHUP', shutdown);

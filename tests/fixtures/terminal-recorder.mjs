import { appendFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const bracketedPaste = args.includes('--bracketed-paste');
const outputPath = args.find((arg) => arg !== '--bracketed-paste');
if (!outputPath) {
  throw new Error('terminal-recorder requires an output path');
}

writeFileSync(outputPath, Buffer.alloc(0));
if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') {
  process.stdin.setRawMode(true);
}
process.stdin.resume();
if (bracketedPaste) {
  process.stdout.write('[?2004h');
}
process.stdout.write('READY\n');

process.stdin.on('data', (chunk) => {
  appendFileSync(outputPath, chunk);
});

function shutdown() {
  try {
    if (bracketedPaste) {
      process.stdout.write('[?2004l');
    }
    if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') {
      process.stdin.setRawMode(false);
    }
  } finally {
    process.exit(0);
  }
}

process.on('SIGTERM', shutdown);
process.on('SIGHUP', shutdown);

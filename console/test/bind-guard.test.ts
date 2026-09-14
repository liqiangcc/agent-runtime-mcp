import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectInterfaceAddresses, evaluateBindAddress, parseIpv6 } from '../src/bind-guard.js';

const TAILSCALE_V4 = 'v4:100.64.0.7';
const TAILSCALE_V6 = 'v6:fd7a:115c:a1e0:0:0:0:0:9';

test('parseIpv6 expands compressed and mapped forms', () => {
  assert.deepEqual(parseIpv6('::1'), [0, 0, 0, 0, 0, 0, 0, 1]);
  assert.deepEqual(parseIpv6('0:0:0:0:0:0:0:1'), [0, 0, 0, 0, 0, 0, 0, 1]);
  assert.deepEqual(parseIpv6('::'), [0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(parseIpv6('fd7a:115c:a1e0::1'), [0xfd7a, 0x115c, 0xa1e0, 0, 0, 0, 0, 1]);
  assert.deepEqual(parseIpv6('FD7A:115C:A1E0::1'), [0xfd7a, 0x115c, 0xa1e0, 0, 0, 0, 0, 1]);
  assert.deepEqual(parseIpv6('::ffff:127.0.0.1'), [0, 0, 0, 0, 0, 0xffff, 0x7f00, 1]);
  assert.deepEqual(parseIpv6('fe80::1%eth0'), [0xfe80, 0, 0, 0, 0, 0, 0, 1]);
  assert.equal(parseIpv6('1:2:3:4:5:6:7'), null);
  assert.equal(parseIpv6('1:2:3:4:5:6:7:8:9'), null);
  assert.equal(parseIpv6(':::1'), null);
  assert.equal(parseIpv6('1::2::3'), null);
  assert.equal(parseIpv6('gggg::1'), null);
  assert.equal(parseIpv6(''), null);
});

test('collectInterfaceAddresses normalizes assigned addresses', () => {
  const assigned = collectInterfaceAddresses({
    tailscale0: [
      { address: '100.64.0.7' },
      { address: 'fd7a:115c:a1e0::9' },
    ],
    lo: [{ address: '127.0.0.1' }, { address: '::1' }],
  });
  assert.ok(assigned.has('v4:100.64.0.7'));
  assert.ok(assigned.has('v6:fd7a:115c:a1e0:0:0:0:0:9'));
  assert.ok(assigned.has('v4:127.0.0.1'));
  assert.ok(assigned.has('v6:0:0:0:0:0:0:0:1'));
});

test('loopback addresses are allowed', () => {
  const assigned = new Set<string>();
  for (const bind of ['127.0.0.1', '127.0.0.2', '127.53.199.240', '::1', '0:0:0:0:0:0:0:1', '::ffff:127.0.0.1']) {
    const verdict = evaluateBindAddress(bind, assigned);
    assert.equal(verdict.allowed, true, `${bind} should be allowed`);
  }
});

test('wildcard and ordinary addresses are refused', () => {
  const assigned = new Set<string>([TAILSCALE_V4, TAILSCALE_V6]);
  for (const bind of ['0.0.0.0', '::', '192.168.1.20', '10.1.2.3', '172.16.0.8', '8.8.8.8', 'fe80::1', 'localhost', 'example.com', '', '999.1.1.1']) {
    const verdict = evaluateBindAddress(bind, assigned);
    assert.equal(verdict.allowed, false, `${bind} should be refused`);
    if (!verdict.allowed) assert.ok(verdict.reason.length > 0);
  }
});

test('Tailscale addresses require local interface assignment', () => {
  const assigned = new Set<string>([TAILSCALE_V4, TAILSCALE_V6]);
  assert.equal(evaluateBindAddress('100.64.0.7', assigned).allowed, true);
  assert.equal(evaluateBindAddress('fd7a:115c:a1e0::9', assigned).allowed, true);

  const withoutTailscale = new Set<string>(['v4:127.0.0.1']);
  for (const bind of ['100.64.0.7', '100.127.255.254', 'fd7a:115c:a1e0::9', 'fd7a:115c:a1e0:abcd::ffff']) {
    const verdict = evaluateBindAddress(bind, withoutTailscale);
    assert.equal(verdict.allowed, false, `${bind} should be refused when unassigned`);
  }
});

test('addresses outside the Tailscale ranges are refused even when assigned', () => {
  const assigned = new Set<string>(['v4:100.63.255.255', 'v4:100.128.0.1', 'v6:fd7a:115c:a1e1:0:0:0:0:1']);
  assert.equal(evaluateBindAddress('100.63.255.255', assigned).allowed, false);
  assert.equal(evaluateBindAddress('100.128.0.1', assigned).allowed, false);
  assert.equal(evaluateBindAddress('fd7a:115c:a1e1::1', assigned).allowed, false);
});

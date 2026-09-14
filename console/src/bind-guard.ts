import { networkInterfaces } from 'node:os';

/**
 * Bind guard: the Console may listen only on a loopback address or on a
 * Tailscale address (100.64.0.0/10, fd7a:115c:a1e0::/48) that is currently
 * assigned to a local network interface. There is no override flag.
 */

export type BindVerdict =
  | { allowed: true; bind: string; family: 4 | 6 }
  | { allowed: false; bind: string; reason: string };

const TAILSCALE_V6_PREFIX = [0xfd7a, 0x115c, 0xa1e0] as const;

export function parseIpv4(value: string): [number, number, number, number] | null {
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^[0-9]{1,3}$/.test(part)) return null;
    if (part.length > 1 && part.startsWith('0')) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    octets.push(octet);
  }
  return octets as [number, number, number, number];
}

export function parseIpv6(value: string): number[] | null {
  let input = value.toLowerCase();
  const zoneIndex = input.indexOf('%');
  if (zoneIndex !== -1) input = input.slice(0, zoneIndex);
  if (input.length === 0 || !/^[0-9a-f:.]+$/.test(input)) return null;

  const lastColon = input.lastIndexOf(':');
  const lastPart = lastColon === -1 ? input : input.slice(lastColon + 1);
  if (lastPart.includes('.')) {
    const v4Tail = parseIpv4(lastPart);
    if (!v4Tail) return null;
    const hi = ((v4Tail[0] << 8) | v4Tail[1]).toString(16);
    const lo = ((v4Tail[2] << 8) | v4Tail[3]).toString(16);
    input = `${lastColon === -1 ? '' : input.slice(0, lastColon + 1)}${hi}:${lo}`;
  }

  const groupValue = (text: string): number | null => (/^[0-9a-f]{1,4}$/.test(text) ? Number.parseInt(text, 16) : null);
  const compressed = input.includes('::');

  let head: (number | null)[];
  let tail: (number | null)[];
  let fill = 0;
  if (compressed) {
    const first = input.indexOf('::');
    if (input.indexOf('::', first + 2) !== -1) return null;
    head = input.slice(0, first) === '' ? [] : input.slice(0, first).split(':').map(groupValue);
    tail = input.slice(first + 2) === '' ? [] : input.slice(first + 2).split(':').map(groupValue);
    fill = 8 - head.length - tail.length;
    if (fill < 1) return null;
  } else {
    head = input === '' ? [] : input.split(':').map(groupValue);
    tail = [];
    if (head.length !== 8) return null;
  }
  if (head.includes(null) || tail.includes(null)) return null;

  const groups: number[] = [...(head as number[]), ...new Array<number>(fill).fill(0), ...(tail as number[])];
  return groups.length === 8 ? groups : null;
}

function isV4Mapped(groups: number[]): boolean {
  return groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff;
}

function v4Key(octets: [number, number, number, number]): string {
  return `v4:${octets.join('.')}`;
}

function v6Key(groups: number[]): string {
  return `v6:${groups.map((g) => g.toString(16)).join(':')}`;
}

/** Canonical set of IP literals currently assigned to local interfaces. */
export function collectInterfaceAddresses(
  interfaces: NodeJS.Dict<{ address: string }[]> = networkInterfaces(),
): Set<string> {
  const assigned = new Set<string>();
  for (const infos of Object.values(interfaces)) {
    for (const info of infos ?? []) {
      const v4 = parseIpv4(info.address);
      if (v4) {
        assigned.add(v4Key(v4));
        continue;
      }
      const v6 = parseIpv6(info.address);
      if (v6) assigned.add(v6Key(v6));
    }
  }
  return assigned;
}

export function evaluateBindAddress(bind: string, assigned: Set<string>): BindVerdict {
  const v4 = parseIpv4(bind);
  if (v4) {
    if (v4[0] === 127) return { allowed: true, bind, family: 4 };
    if (v4[0] === 100 && v4[1] >= 64 && v4[1] <= 127) {
      return assigned.has(v4Key(v4))
        ? { allowed: true, bind, family: 4 }
        : { allowed: false, bind, reason: 'Tailscale-range address is not assigned to a local interface' };
    }
    return { allowed: false, bind, reason: 'not a loopback or Tailscale (100.64.0.0/10) address' };
  }

  const v6 = parseIpv6(bind);
  if (v6) {
    if (isV4Mapped(v6)) {
      const embedded: [number, number, number, number] = [
        v6[6] >> 8,
        v6[6] & 0xff,
        v6[7] >> 8,
        v6[7] & 0xff,
      ];
      const inner = evaluateBindAddress(embedded.join('.'), assigned);
      return inner.allowed ? { allowed: true, bind, family: 6 } : { allowed: false, bind, reason: inner.reason };
    }
    if (v6.every((g, i) => g === (i === 7 ? 1 : 0))) return { allowed: true, bind, family: 6 };
    if (v6[0] === TAILSCALE_V6_PREFIX[0] && v6[1] === TAILSCALE_V6_PREFIX[1] && v6[2] === TAILSCALE_V6_PREFIX[2]) {
      return assigned.has(v6Key(v6))
        ? { allowed: true, bind, family: 6 }
        : { allowed: false, bind, reason: 'Tailscale-range address (fd7a:115c:a1e0::/48) is not assigned to a local interface' };
    }
    return { allowed: false, bind, reason: 'not a loopback (::1) or Tailscale (fd7a:115c:a1e0::/48) address' };
  }

  return { allowed: false, bind, reason: 'not an IP literal; CONSOLE_BIND accepts IP literals only' };
}

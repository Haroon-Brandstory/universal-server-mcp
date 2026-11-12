import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import type { SsrfConfig } from "../types.js";

const METADATA_HOSTS = new Set([
  "metadata.google.internal",
  "metadata.azure.com",
  "169.254.169.254",
]);

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

function isPrivateIPv4(ip: string): boolean {
  // Never run dotted-quad math on IPv6 — Number("2606:…")→NaN→0≡0.0.0.0 (false private).
  if (isIP(ip) !== 4) return false;
  const n = ipv4ToInt(ip);
  const ranges: Array<[number, number]> = [
    [ipv4ToInt("10.0.0.0"), ipv4ToInt("10.255.255.255")],
    [ipv4ToInt("172.16.0.0"), ipv4ToInt("172.31.255.255")],
    [ipv4ToInt("192.168.0.0"), ipv4ToInt("192.168.255.255")],
    [ipv4ToInt("100.64.0.0"), ipv4ToInt("100.127.255.255")],
    [ipv4ToInt("0.0.0.0"), ipv4ToInt("0.255.255.255")],
  ];
  return ranges.some(([a, b]) => n >= a && n <= b);
}

/** fc00::/7 unique local addresses */
function isUniqueLocalIPv6(ip: string): boolean {
  if (isIP(ip) !== 6) return false;
  const first = ip.toLowerCase().split(":")[0] || "";
  // Expand omitted zeros: "fc00", "fd12", also "fc" only if full hextet starts with fc/fd
  if (first.length === 0) return false;
  const n = parseInt(first.padEnd(4, "0").slice(0, 4), 16);
  if (!Number.isFinite(n)) return false;
  return (n & 0xfe00) === 0xfc00;
}

function isLoopback(ip: string): boolean {
  if (ip === "::1") return true;
  if (isIP(ip) === 4) {
    const n = ipv4ToInt(ip);
    return n >= ipv4ToInt("127.0.0.0") && n <= ipv4ToInt("127.255.255.255");
  }
  return false;
}

function isLinkLocal(ip: string): boolean {
  if (ip.toLowerCase().startsWith("fe80:")) return true;
  if (isIP(ip) === 4) {
    const n = ipv4ToInt(ip);
    return n >= ipv4ToInt("169.254.0.0") && n <= ipv4ToInt("169.254.255.255");
  }
  return false;
}

export interface SsrfResult {
  ok: boolean;
  reason?: string;
  resolvedIps?: string[];
}

export async function assertSafeUrl(
  rawUrl: string,
  cfg: SsrfConfig,
  denyHosts: string[]
): Promise<SsrfResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "Invalid URL" };
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return { ok: false, reason: `Protocol not allowed: ${url.protocol}` };
  }

  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();

  if (cfg.block_metadata && (METADATA_HOSTS.has(host) || denyHosts.map((h) => h.toLowerCase()).includes(host))) {
    return { ok: false, reason: `Denied host: ${host}` };
  }

  // Literal IP in URL
  if (isIP(host)) {
    return checkIp(host, cfg);
  }

  let addresses: string[];
  try {
    const records = await lookup(host, { all: true });
    addresses = records.map((r) => r.address);
  } catch {
    return { ok: false, reason: `DNS lookup failed for ${host}` };
  }

  for (const ip of addresses) {
    const r = checkIp(ip, cfg);
    if (!r.ok) return { ...r, resolvedIps: addresses };
  }

  return { ok: true, resolvedIps: addresses };
}

function checkIp(ip: string, cfg: SsrfConfig): SsrfResult {
  if (cfg.block_metadata && (ip === "169.254.169.254" || isLinkLocal(ip))) {
    return { ok: false, reason: `Blocked metadata/link-local IP: ${ip}` };
  }
  if (cfg.block_link_local && isLinkLocal(ip)) {
    return { ok: false, reason: `Blocked link-local IP: ${ip}` };
  }
  if (cfg.block_loopback && isLoopback(ip)) {
    return { ok: false, reason: `Blocked loopback IP: ${ip}` };
  }
  if (cfg.block_private && isPrivateIPv4(ip)) {
    return { ok: false, reason: `Blocked private IP: ${ip}` };
  }
  if (cfg.block_private && isUniqueLocalIPv6(ip)) {
    return { ok: false, reason: `Blocked ULA IPv6: ${ip}` };
  }
  return { ok: true };
}

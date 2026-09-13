/**
 * config-cache.ts
 *
 * In-memory cache for the `config` table.
 * Replaces direct prisma.config.findUnique calls throughout the app.
 *
 * - All keys are loaded in ONE query and cached for TTL_MS (30s default).
 * - Any write (upsert/update) immediately invalidates the cache so the next
 *   read reflects the new value without waiting for TTL expiry.
 * - Thread-safe: a single pending promise prevents stampedes.
 */

import prisma from './prisma.js';

const TTL_MS = 30_000; // 30 seconds

let cache: Map<string, string> | null = null;
let cacheExpiresAt = 0;
let pendingFetch: Promise<Map<string, string>> | null = null;

async function load(): Promise<Map<string, string>> {
  const rows = await prisma.config.findMany();
  const map = new Map<string, string>();
  for (const row of rows) map.set(row.key, row.value);
  cache = map;
  cacheExpiresAt = Date.now() + TTL_MS;
  pendingFetch = null;
  return map;
}

async function getAll(): Promise<Map<string, string>> {
  if (cache && Date.now() < cacheExpiresAt) return cache;
  if (pendingFetch) return pendingFetch;
  pendingFetch = load();
  return pendingFetch;
}

/** Invalidate the cache — call after any config write. */
export function invalidateConfigCache(): void {
  cache = null;
  cacheExpiresAt = 0;
}

/** Get a config value, returning undefined if not set. */
export async function getConfig(key: string): Promise<string | undefined> {
  const map = await getAll();
  return map.get(key);
}

/** Get a config value with a fallback default. */
export async function getConfigOrDefault(key: string, defaultValue: string): Promise<string> {
  const val = await getConfig(key);
  return val ?? defaultValue;
}

/** Convenience: parse as integer with a fallback. */
export async function getConfigInt(key: string, defaultValue: number): Promise<number> {
  const val = await getConfig(key);
  if (!val) return defaultValue;
  const n = parseInt(val, 10);
  return Number.isFinite(n) ? n : defaultValue;
}

/** Convenience: parse as float with a fallback. */
export async function getConfigFloat(key: string, defaultValue: number): Promise<number> {
  const val = await getConfig(key);
  if (!val) return defaultValue;
  const n = parseFloat(val);
  return Number.isFinite(n) ? n : defaultValue;
}

/** Convenience: parse as boolean ('true' string). */
export async function getConfigBool(key: string, defaultValue = false): Promise<boolean> {
  const val = await getConfig(key);
  if (val === undefined) return defaultValue;
  return val === 'true';
}

/**
 * Write a config value AND invalidate the cache.
 * Drop-in replacement for prisma.config.upsert({ where: { key }, ... })
 */
export async function setConfig(key: string, value: string): Promise<void> {
  await prisma.config.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
  invalidateConfigCache();
}

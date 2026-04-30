import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_DIR = path.join(__dirname, 'data', 'cache');

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

/**
 * Simple file-based cache service.
 * Stores JSON files in server/data/cache/ with configurable TTL.
 */
export function getCached<T>(key: string): T | null {
  const filePath = path.join(CACHE_DIR, `${key}.json`);

  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const entry: CacheEntry<T> = JSON.parse(raw);
    const age = Date.now() - entry.timestamp;

    if (age > entry.ttl) {
      // Cache expired — delete file
      fs.unlinkSync(filePath);
      return null;
    }

    return entry.data;
  } catch {
    return null;
  }
}

/**
 * Write data to cache with a TTL (default 24 hours).
 */
export function setCache<T>(key: string, data: T, ttlMs: number = 24 * 60 * 60 * 1000): void {
  const filePath = path.join(CACHE_DIR, `${key}.json`);
  const entry: CacheEntry<T> = {
    data,
    timestamp: Date.now(),
    ttl: ttlMs,
  };

  fs.writeFileSync(filePath, JSON.stringify(entry, null, 2), 'utf-8');
}

/**
 * Invalidate a cache entry.
 */
export function clearCache(key: string): void {
  const filePath = path.join(CACHE_DIR, `${key}.json`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

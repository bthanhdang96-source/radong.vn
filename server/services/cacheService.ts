import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const CACHE_DIR = path.join(DATA_DIR, 'cache');
const HISTORY_DIR = path.join(DATA_DIR, 'history');

for (const dir of [CACHE_DIR, HISTORY_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

function readCacheEntry<T>(key: string): CacheEntry<T> | null {
  const filePath = path.join(CACHE_DIR, `${key}.json`);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as CacheEntry<T>;
  } catch {
    return null;
  }
}

export function getCacheEntry<T>(key: string): CacheEntry<T> | null {
  return readCacheEntry<T>(key);
}

export function getCached<T>(key: string): T | null {
  const filePath = path.join(CACHE_DIR, `${key}.json`);
  const entry = readCacheEntry<T>(key);
  if (!entry) {
    return null;
  }

  const age = Date.now() - entry.timestamp;
  if (age > entry.ttl) {
    fs.unlinkSync(filePath);
    return null;
  }

  return entry.data;
}

export function setCache<T>(key: string, data: T, ttlMs: number = 24 * 60 * 60 * 1000): void {
  const filePath = path.join(CACHE_DIR, `${key}.json`);
  const entry: CacheEntry<T> = {
    data,
    timestamp: Date.now(),
    ttl: ttlMs,
  };

  fs.writeFileSync(filePath, JSON.stringify(entry, null, 2), 'utf-8');
}

export function clearCache(key: string): void {
  const filePath = path.join(CACHE_DIR, `${key}.json`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

export function appendHistory<T>(date: string, data: T): void {
  const filePath = path.join(HISTORY_DIR, `${date}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');

  const files = fs
    .readdirSync(HISTORY_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort();

  while (files.length > 90) {
    const oldest = files.shift();
    if (oldest) {
      fs.unlinkSync(path.join(HISTORY_DIR, oldest));
    }
  }
}

export function getHistory<T>(date: string): T | null {
  const filePath = path.join(HISTORY_DIR, `${date}.json`);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

export function listHistoryDates(limit = 90): string[] {
  return fs
    .readdirSync(HISTORY_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.replace(/\.json$/, ''))
    .sort()
    .slice(-limit);
}

import Redis from 'ioredis'

// Singleton Redis client. REDIS_URL from env (default localhost:6379).
// Falls back to a no-op cache if Redis is unreachable, so app boots even
// without Redis running.
let client: Redis | null = null
let connectFailed = false

function getClient(): Redis | null {
  if (connectFailed) return null
  if (client) return client
  const url = process.env.REDIS_URL || 'redis://localhost:6379'
  try {
    client = new Redis(url, {
      lazyConnect: false,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    })
    client.on('error', (err) => {
      if (!connectFailed) {
        console.warn(`[cache] Redis error, disabling cache: ${err.message}`)
        connectFailed = true
      }
    })
    return client
  } catch (err) {
    connectFailed = true
    return null
  }
}

// BigInt-safe JSON stringify (schema has 4 BigInt columns — serialize as decimal string).
function stringify(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
}

export async function cached<T>(
  key: string,
  ttlSec: number,
  loader: () => Promise<T>
): Promise<T> {
  const c = getClient()
  if (!c) return loader()
  try {
    const hit = await c.get(key)
    if (hit) return JSON.parse(hit) as T
  } catch {
    /* ignore, fall through to loader */
  }
  const value = await loader()
  try {
    await c.set(key, stringify(value), 'EX', ttlSec)
  } catch {
    /* ignore write failure */
  }
  return value
}

export async function invalidate(prefix: string): Promise<void> {
  const c = getClient()
  if (!c) return
  try {
    const keys = await c.keys(`${prefix}*`)
    if (keys.length > 0) await c.del(...keys)
  } catch {
    /* ignore */
  }
}

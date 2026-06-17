// import { Redis } from "@upstash/redis/cloudflare"
// import type { KizloKeyValueStorage } from "@/kizlo.types"

// export function kizloKeyValueStorage(env: ApiBindings): KizloKeyValueStorage {
// 	const redis = new Redis({
// 		url: env.UPSTASH_REDIS_URL,
// 		token: env.UPSTASH_REDIS_TOKEN,
// 	})

// 	return {
// 		get: async (key, storage) => {
// 			switch (storage) {
// 				case "crud-heavy": {
// 					const data = await redis.get(key)
// 					if (!data) return null
// 					return typeof data === "string" ? data : JSON.stringify(data)
// 				}

// 				case "read-heavy": {
// 					return await env.KV.get(key)
// 				}
// 			}
// 		},
// 		set: async (key, val, config) => {
// 			switch (config.storage) {
// 				case "crud-heavy": {
// 					await redis.set(key, val, { ex: config.ttlSec as never })
// 					break
// 				}

// 				case "read-heavy": {
// 					await env.KV.put(key, val, { expirationTtl: config.ttlSec })
// 					break
// 				}
// 			}
// 		},
// 		del: async (key, storage) => {
// 			switch (storage) {
// 				case "crud-heavy": {
// 					await redis.del(key)
// 					break
// 				}

// 				case "read-heavy": {
// 					await env.KV.delete(key)
// 					break
// 				}
// 			}
// 		},
// 	}
// }

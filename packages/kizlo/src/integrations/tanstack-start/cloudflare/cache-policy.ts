export const EDGE_HEADERS = ["Cloudflare-CDN-Cache-Control", "CDN-Cache-Control", "Cache-Control"] as const

export function validateTags(tags: readonly string[]): string[] {
	if (!Array.isArray(tags)) throw new TypeError("CDN tags must be an array of strings.")
	if (tags.length > 998) throw new RangeError("At most 998 explicit CDN tags are supported per response.")
	for (const tag of tags) {
		if (typeof tag !== "string" || !tag.length || tag.length > 1024 || /[^\x21-\x2b\x2d-\x7e]/.test(tag)) {
			throw new TypeError("CDN tags must contain 1-1024 printable ASCII characters without spaces or commas.")
		}
	}
	return [...new Set(tags)]
}

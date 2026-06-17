export type Identifier = { type: "id"; value: number } | { type: "email" | "other"; value: string }

export function parseIdentifier(value: unknown, maxLength: number = 200): Identifier | null {
	const input = String(value).trim()
	if (input.length === 0) return null
	if (input.length > maxLength) return null

	if (/^\d+$/.test(input)) {
		const num = Number(input)
		if (num <= 0 || num > Number.MAX_SAFE_INTEGER) return null
		return { type: "id", value: num }
	}

	if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input)) {
		return { type: "email", value: input }
	}

	if (!/^[a-zA-Z0-9._@-]+$/.test(input)) return null

	return { type: "other", value: input }
}

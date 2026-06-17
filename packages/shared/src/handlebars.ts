export function handlebars(str: string) {
	return {
		compile<T extends Record<string, string>>(data: T) {
			const lowerData = Object.fromEntries(Object.entries(data).map(([k, v]) => [k.toLowerCase(), v]))

			return str.replace(/{{(.*?)}}/g, (_, key: string) => lowerData[key.toLowerCase()] ?? "")
		},
		hasPlaceholders<T extends string>(placeholders: T[]): Record<T, boolean> {
			const lowerStr = str.toLowerCase()
			const result = {} as Record<T, boolean>

			for (const ph of placeholders) {
				result[ph] = lowerStr.includes(`{{${ph.toLowerCase()}}}`)
			}

			return result
		},
	}
}

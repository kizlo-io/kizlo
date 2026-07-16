export type VariableContext = Record<string, string>

const TOKEN = /\{\{\s*(\w+)\s*\}\}/g

export function resolveTemplate(template: string, context: VariableContext): string {
	return template.replace(TOKEN, (match, key: string) => {
		const value = context[key]
		return value !== undefined ? value : match
	})
}

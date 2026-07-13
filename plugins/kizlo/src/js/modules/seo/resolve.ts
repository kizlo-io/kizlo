export type VariableContext = Record<string, string>

// Mirrors the {{token}} substitution in PHP's Variables::resolve, but runs in
// the browser so the meta box preview can re-resolve as the editor changes.
// Tokens with no live value are left untouched rather than blanked, so an
// unresolvable variable (e.g. one this context can't source) stays visible
// instead of silently vanishing from the preview.
const TOKEN = /\{\{\s*(\w+)\s*\}\}/g

export function resolveTemplate(template: string, context: VariableContext): string {
	return template.replace(TOKEN, (match, key: string) => {
		const value = context[key]
		return value !== undefined ? value : match
	})
}

/**
 * Renders a section description served as an HTML string by PHP (SettingsNav).
 * The authoritative sanitizing gate is `wp_kses_post` on the server; the copy is
 * authored by us, so the client just renders it. Inline only (lives inside a
 * paragraph), so it renders as a fragment via a span.
 */
export function SectionDesc({ html }: { html?: string }) {
	if (!html) return null

	// Server-sanitized (wp_kses_post) developer copy — safe to render as-is.
	return <span dangerouslySetInnerHTML={{ __html: html }} />
}

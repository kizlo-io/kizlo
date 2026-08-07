type ContentArgs = {
	name: string
}

/**
 * Field-level copy for the post-type / taxonomy / authors forms. Section-level
 * headings and descriptions are served by PHP (SettingsNav) and rendered from
 * the nav; only the individual field labels and descriptions live here, some
 * templated with the object name.
 */
export function getContent({ name }: ContentArgs) {
	const lowercaseName = name.toLowerCase()

	return {
		access: {
			enabled: {
				label: "Allow API access",
				description: <>When off, all API access to this post type is blocked, including secret key access.</>,
			},
		},

		url: {
			pathname: {
				label: "Pathname structure",
				description: <>Use variables to build dynamic URLs. The resolved path is used for canonical links and sitemaps.</>,
			},
		},

		seo: {
			enabled: {
				label: "Enable SEO support",
				description: (
					<>
						When on, Kizlo generates and includes SEO data in the {lowercaseName} response — title, description, and structured data fields.
					</>
				),
			},
			visibility: {
				label: "Show in search results",
				description: (
					<>
						When off, Kizlo adds <code>noindex, nofollow</code> to all {lowercaseName} and removes them from the XML sitemap. Useful for
						private types like orders or user profiles.
					</>
				),
			},
		},

		meta: {
			title: {
				label: "Page title structure",
				description: (
					<>
						Build the <code>&lt;title&gt;</code> tag for {lowercaseName}. The <strong>Separator</strong> variable uses the character set in
						General → Title format. Aim for under 60 characters.
					</>
				),
			},
			description_: {
				label: "Meta description structure",
				description: "Shown in search snippets. Keep it under 160 characters. Leave blank to fall back to the excerpt.",
			},
		},

		schema: {
			pageType: {
				description: (
					<>
						The Schema.org <code>WebPage</code> subtype. Use <strong>Web Page</strong> when unsure — the other types add richer signals for
						specific content kinds.
					</>
				),
			},
			articleType: {
				description: (
					<>
						The Schema.org <code>Article</code> subtype. Choose <strong>None</strong> if {lowercaseName} are not article-like — for example,
						a product page or landing page.
					</>
				),
			},
			commentUrl: {
				label: "Comment URL structure",
				description: (
					<>
						The URL pointing to the comments section. Use <code>{"{{pathname}}"}</code> for the resolved path — for example{" "}
						<code>{"{{pathname}}#comments"}</code>.
					</>
				),
			},
		},
	}
}

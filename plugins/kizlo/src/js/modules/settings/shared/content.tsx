type ContentArgs = {
	name: string
}

export function getContent({ name }: ContentArgs) {
	const lowercaseName = name.toLowerCase()

	return {
		access: {
			heading: <>REST API</>,
			description: <>Defines who and how {lowercaseName} type can be accessed through the REST API.</>,
			enabled: {
				label: "Allow API access",
				description: (
					<>
						Disables all API access to this post type, including secret key access. When enabled, use the publicly_queryable flag to control
						whether public key can access it.
					</>
				),
			},
			base: {
				label: "REST API Base",
				description: 'The base route for this post type\'s REST API endpoint (e.g. "posts", "products").',
			},
			namespace: {
				label: "REST API Namespace",
				description: 'The namespace for this post type\'s REST API endpoint (e.g. "wp/v2", "wc/v3").',
			},
		},

		url: {
			heading: <>URL Structure</>,
			description: (
				<>
					Defines the URL pattern for {lowercaseName}. The resolved path is used across canonical links, SEO meta tags, structured data, and
					the preview link inside the {lowercaseName} editor.
				</>
			),
			pathname: {
				label: "Pathname structure",
				description: <>Use variables to build dynamic URLs. The resolved path is used for canonical links and sitemaps.</>,
			},
		},

		seo: {
			heading: <>SEO</>,
			description: <>Control how search engines see and display {lowercaseName}.</>,
			enabled: {
				label: "Enable SEO support",
				description: (
					<>
						When on, Kizlo generates and includes SEO data in the {lowercaseName} response — title, description, and structured data fields.
					</>
				),
			},
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
	}
}

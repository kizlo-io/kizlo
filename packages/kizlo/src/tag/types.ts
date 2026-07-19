import type { WPK_Seo } from "../seo/types"
import type { WP_Tag } from "../wordpress"

/**
 * The `kizlo` enrichment block injected by the plugin's `TermExtension`. `url`
 * (the resolver-built term archive link) rides on every response; `seo` is only
 * present on single-term fetches, never on list items.
 */
export interface WPK_TagEnrichment {
	url?: string
	seo?: WPK_Seo
}

export interface WPK_Tag extends WP_Tag {
	kizlo: WPK_TagEnrichment
}

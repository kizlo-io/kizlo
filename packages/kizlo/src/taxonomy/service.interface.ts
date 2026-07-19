import type { WPK_Seo } from "../seo/types"
import type { Identifier } from "../shared/identifier"
import type {
	WP_CategoryCreateErrorCode,
	WP_CategoryDeleteErrorCode,
	WP_CategoryListErrorCode,
	WP_CategoryRetrieveErrorCode,
	WP_CategoryUpdateErrorCode,
} from "../wordpress"

/**
 * The `kizlo` enrichment block injected onto term responses by the plugin's
 * `TermExtension` (`rest_prepare_{taxonomy}`). `url` (the resolver-built archive
 * link) rides on every response; `seo` is only present on single-term fetches.
 */
export interface WPK_TaxonomyEnrichment {
	url?: string
	seo?: WPK_Seo
}

export interface WPK_Taxonomy {
	/** Unique identifier for the term. */
	id: number
	/** Number of published objects for the term. */
	count: number
	/** HTML description of the term. */
	description: string
	/** URL of the term. */
	link: string
	/** HTML title for the term. */
	name: string
	/** An alphanumeric identifier for the term unique to its type. */
	slug: string
	/** Type attribution for the term. */
	taxonomy: string
	/** The parent term ID. */
	parent: number
	/** Meta fields. */
	meta: Record<string, unknown>
	kizlo: WPK_TaxonomyEnrichment
}

/** Term collection params shared by every taxonomy (categories, tags, custom). */
export interface WPK_TaxonomyListInput {
	context?: "view" | "embed" | "edit"
	page?: number
	per_page?: number
	search?: string
	exclude?: number | number[]
	include?: number | number[]
	order?: "asc" | "desc"
	orderby?: string
	hide_empty?: boolean
	parent?: number
	post?: number
	slug?: string | string[]
}

export interface WPK_CreateTaxonomyInput {
	name?: string
	slug?: string
	description?: string
	parent?: number
	meta?: Record<string, unknown>
}

export interface WPK_UpdateTaxonomyInput extends WPK_CreateTaxonomyInput {
	identifier: Identifier
}

export interface WPK_DeleteTaxonomyInput {
	identifier: Identifier
	force?: boolean
}

/**
 * Error codes returned by the custom `kizlo/v1/taxonomies` routes. These widen
 * the underlying WP core term error codes with the plugin's own guards:
 * `invalid_taxonomy` (unknown taxonomy) and `term_not_found` (unresolved slug or id).
 */
export type WPK_TaxonomyListErrorCode = WP_CategoryListErrorCode | "invalid_taxonomy"
export type WPK_TaxonomyRetrieveErrorCode = WP_CategoryRetrieveErrorCode | "invalid_taxonomy" | "term_not_found"
export type WPK_TaxonomyCreateErrorCode = WP_CategoryCreateErrorCode | "invalid_taxonomy"
export type WPK_TaxonomyUpdateErrorCode = WP_CategoryUpdateErrorCode | "invalid_taxonomy" | "term_not_found"
export type WPK_TaxonomyDeleteErrorCode = WP_CategoryDeleteErrorCode | "invalid_taxonomy" | "term_not_found"

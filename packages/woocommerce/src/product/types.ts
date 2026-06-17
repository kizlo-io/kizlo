import type { WP_CurrencyFormat } from "kizlo"
import type { WC_Product } from "./types.wc"
import type { WCS_Product, WCS_ProductCollectionData } from "./types.wcs"

export interface WCK_Product extends WC_Product {
	kizlo: {
		attributes: {
			id: number
			name: string
			taxonomy: string
			has_variations: false
			terms: {
				id: number
				name: string
				slug: string
			}[]
		}[]
		variations: {
			id: number
			attributes: {
				name: string
				value: string
			}[]
		}[]
		prices: {
			price: string
			regular_price: string
			sale_price: string
		}
		currency_format: WP_CurrencyFormat
	}
}

export interface WCSK_Product extends WCS_Product {
	extensions: {
		kizlo: {
			on_sale_from: string | null
			on_sale_to: string | null
			hs_code: string | null
			stock: number | null
		}
	}
}

export interface WCSK_ProductCollectionData extends WCS_ProductCollectionData {
	kizlo: {
		taxonomy_counts: WCSK_ProductCollectionDataTaxonomy[]
		attribute_counts: WCSK_ProductCollectionDataAttribute[]
	}
}

export interface WCSK_ProductCollectionDataTaxonomy {
	id: number
	name: string
	slug: string
	taxonomy: string
	description: string
	parent: number
	count: number
	thumbnail: string | null
}

export interface WCSK_ProductCollectionDataAttribute {
	id: number
	name: string
	slug: string
	taxonomy: string
	description: string
	parent: number
	count: number
	swatch_type: "text" | "color" | "image"
	swatch: string | null
}

import type { WP_CustomFields, WP_EndpointData } from "kizlo"

/**
 * A product from the REST v3 API, with the `kizlo` block this plugin's response filter adds.
 *
 * The administrative shape rather than the storefront one: it carries every status, which is what
 * makes it the type a preview reads.
 */
export type WCK_Product = WP_EndpointData<"woocommerce.products.retrieve">

/**
 * A product from the Store API, with the `extensions.kizlo` block this plugin registers.
 *
 * A different shape from {@link WCK_Product} for the same product. The Store API reports prices in
 * minor units and hides anything unpublished, so the two are not interchangeable.
 */
export type WCSK_Product = WP_EndpointData<"woocommerce.store.products.list">[number]

/** The exact resolved custom-field shape configured for products on this WordPress site. */
export type ProductCustomFields = WP_CustomFields<"postTypes.product">

/** A published Store API product that may carry Kizlo's fixed recommendation embeddings. */
export type WCSK_ProductDetail = WP_EndpointData<"woocommerce.store.products.getById">

/** A Store API product filtered to fields WooCommerce permits in embed context. */
export type WCSK_ProductSummary = NonNullable<NonNullable<WCSK_ProductDetail["_embedded"]>["upsells"]>[number][number]

/** Collection counts, with the `kizlo` block the route interceptor adds. */
export type WCSK_ProductCollectionData = WP_EndpointData<"woocommerce.store.products.collectionData">

export type WCSK_ProductCollectionDataTaxonomy = WCSK_ProductCollectionData["kizlo"]["taxonomy_counts"][number]

export type WCSK_ProductCollectionDataAttribute = WCSK_ProductCollectionData["kizlo"]["attribute_counts"][number]

// ==================================================
// SHARED
// ==================================================

export type WC_Context = "view" | "edit"

export type WC_SortOrder = "asc" | "desc"

export type WC_CustomerOrderBy = "id" | "include" | "name" | "registered_date"

export type WC_CustomerRole = "all" | "administrator" | "editor" | "author" | "contributor" | "subscriber" | "customer" | "shop_manager"

// ==================================================
// SUPPORTING SCHEMAS
// ==================================================

export interface WC_CustomerBillingAddress {
	/** First name. */
	first_name: string
	/** Last name. */
	last_name: string
	/** Company name. */
	company: string
	/** Address line 1 */
	address_1: string
	/** Address line 2 */
	address_2: string
	/** City name. */
	city: string
	/** ISO code or name of the state, province or district. */
	state: string
	/** Postal code. */
	postcode: string
	/** ISO code of the country. */
	country: string
	/** Email address. */
	email: string
	/** Phone number. */
	phone: string
}

export interface WC_CustomerShippingAddress {
	/** First name. */
	first_name: string
	/** Last name. */
	last_name: string
	/** Company name. */
	company: string
	/** Address line 1 */
	address_1: string
	/** Address line 2 */
	address_2: string
	/** City name. */
	city: string
	/** ISO code or name of the state, province or district. */
	state: string
	/** Postal code. */
	postcode: string
	/** ISO code of the country. */
	country: string
	/** Phone number. */
	phone: string
}

export interface WC_MetaData {
	/** Meta ID. Read-only. */
	id: number
	/** Meta key. */
	key: string
	/** Meta value. */
	value: string
}

export interface WC_MetaDataInput {
	id?: number
	key: string
	value: unknown
}

export interface WC_CustomerDownloadFile {
	/** File name. Read-only. */
	name: string
	/** File URL. Read-only. */
	file: string
}

export interface WC_CustomerDownload {
	/** Download ID (MD5). Read-only. */
	download_id: string
	/** Download file URL. Read-only. */
	download_url: string
	/** Downloadable product ID. Read-only. */
	product_id: number
	/** Product name. Read-only. */
	product_name: string
	/** Downloadable file name. Read-only. */
	download_name: string
	/** Order ID. Read-only. */
	order_id: number
	/** Order key. Read-only. */
	order_key: string
	/** Number of downloads remaining. Read-only. */
	downloads_remaining: string
	/** The date when download access expires, in the site's timezone. Read-only. */
	access_expires: string
	/** The date when download access expires, as GMT. Read-only. */
	access_expires_gmt: string
	/** File details. Read-only. */
	file: WC_CustomerDownloadFile
}

// ==================================================
// CUSTOMER (response schema)
// ==================================================

export interface WC_Customer {
	/** Unique identifier for the resource. Read-only. */
	id: number
	/** The date the customer was created, in the site's timezone. Read-only. */
	date_created: string
	/** The date the customer was created, as GMT. Read-only. */
	date_created_gmt: string
	/** The date the customer was last modified, in the site's timezone. Read-only. */
	date_modified: string
	/** The date the customer was last modified, as GMT. Read-only. */
	date_modified_gmt: string
	/** The email address for the customer. */
	email: string
	/** Customer first name. */
	first_name: string
	/** Customer last name. */
	last_name: string
	/** Customer role. Read-only. */
	role: string
	/** Customer login name. */
	username: string
	/** List of billing address data. */
	billing: WC_CustomerBillingAddress
	/** List of shipping address data. */
	shipping: WC_CustomerShippingAddress
	/** Is the customer a paying customer? Read-only. */
	is_paying_customer: boolean
	/** Avatar URL. Read-only. */
	avatar_url: string
	/** Meta data. */
	meta_data: WC_MetaData[]
}

// ==================================================
// LIST — GET /wc/v3/customers
// ==================================================

export interface WC_CustomerListInput {
	/** Scope under which the request is made; determines fields present in response. */
	context?: WC_Context
	/** Current page of the collection. */
	page?: number
	/** Maximum number of items to be returned in result set. */
	per_page?: number
	/** Limit results to those matching a string. */
	search?: string
	/** Ensure result set excludes specific IDs. */
	exclude?: number[]
	/** Limit result set to specific IDs. */
	include?: number[]
	/** Offset the result set by a specific number of items. */
	offset?: number
	/** Order sort attribute ascending or descending. */
	order?: WC_SortOrder
	/** Sort collection by object attribute. */
	orderby?: WC_CustomerOrderBy
	/** Limit result set to resources with a specific email. */
	email?: string
	/** Limit result set to resources with a specific role. */
	role?: WC_CustomerRole
}

export type WC_CustomerListErrorCode = "woocommerce_rest_cannot_view"

// ==================================================
// CREATE — POST /wc/v3/customers
// ==================================================

export interface WC_CustomerCreateInput {
	/** The email address for the customer. */
	email: string
	/** Customer first name. */
	first_name?: string
	/** Customer last name. */
	last_name?: string
	/** Customer login name. */
	username?: string
	/** Customer password. */
	password?: string
	/** List of billing address data. */
	billing?: Partial<WC_CustomerBillingAddress>
	/** List of shipping address data. */
	shipping?: Partial<WC_CustomerShippingAddress>
	/** Meta data. */
	meta_data?: WC_MetaDataInput[]
}

export type WC_CustomerCreateErrorCode = "woocommerce_rest_cannot_create" | "woocommerce_rest_customer_exists"

// ==================================================
// RETRIEVE — GET /wc/v3/customers/<id>
// ==================================================

export interface WC_CustomerRetrieveInput {
	id: number
}

export type WC_CustomerRetrieveErrorCode = "woocommerce_rest_cannot_view" | "wc_user_invalid_id"

// ==================================================
// UPDATE — PUT /wc/v3/customers/<id>
// ==================================================

export interface WC_CustomerUpdateInput {
	id: number
	/** The email address for the customer. */
	email?: string
	/** Customer first name. */
	first_name?: string
	/** Customer last name. */
	last_name?: string
	/** Customer password. */
	password?: string
	/** List of billing address data. */
	billing?: Partial<WC_CustomerBillingAddress>
	/** List of shipping address data. */
	shipping?: Partial<WC_CustomerShippingAddress>
	/** Meta data. */
	meta_data?: WC_MetaDataInput[]
}

export type WC_CustomerUpdateErrorCode =
	| "woocommerce_rest_cannot_edit"
	| "woocommerce_rest_customer_invalid_email"
	| "woocommerce_rest_customer_invalid_argument"
	| "woocommerce_rest_invalid_id"
	| "wc_user_invalid_id"

// ==================================================
// DELETE — DELETE /wc/v3/customers/<id>
// ==================================================

export interface WC_CustomerDeleteInput {
	id: number
	/** Required to be true, as resource does not support trashing. */
	force: boolean
	/** User ID to reassign posts to. */
	reassign?: number
}

export type WC_CustomerDeleteResponse = WC_Customer

export type WC_CustomerDeleteErrorCode =
	| "woocommerce_rest_cannot_delete"
	| "woocommerce_rest_customer_invalid_reassign"
	| "woocommerce_rest_trash_not_supported"
	| "wc_user_invalid_id"

// ==================================================
// BATCH — POST /wc/v3/customers/batch
// ==================================================

export interface WC_CustomerBatchInput {
	create?: WC_CustomerCreateInput[]
	update?: Array<WC_CustomerUpdateInput & { id: number }>
	delete?: number[]
}

export interface WC_CustomerBatchResponse {
	create?: WC_Customer[]
	update?: WC_Customer[]
	delete?: WC_Customer[]
}

export type WC_CustomerBatchErrorCode =
	| "woocommerce_rest_cannot_batch"
	| WC_CustomerCreateErrorCode
	| WC_CustomerUpdateErrorCode
	| WC_CustomerDeleteErrorCode

// ==================================================
// LIST DOWNLOADS — GET /wc/v3/customers/<id>/downloads
// ==================================================

export interface WC_CustomerDownloadListInput {
	id: number
	/** Scope under which the request is made; determines fields present in response. */
	context?: WC_Context
}

export type WC_CustomerDownloadListErrorCode = "woocommerce_rest_cannot_view"

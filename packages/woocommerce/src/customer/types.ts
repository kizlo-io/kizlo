// export interface CustomerRepositoryInterface {
// 	retrieve(id: number): Promise<WP_Customer | null>
// 	update(id: number, input: WP_UpdateCustomerInput): Promise<WP_Customer | null>
// }

// export interface WP_Customer {
// 	/**
// 	 * Unique identifier for the resource.
// 	 */
// 	id: number

// 	/**
// 	 * The date the customer was created, in the site's timezone.
// 	 */
// 	date_created: string

// 	/**
// 	 * The date the customer was created, as GMT.
// 	 */
// 	date_created_gmt: string

// 	/**
// 	 * The date the customer was last modified, in the site's timezone.
// 	 */
// 	date_modified: string

// 	/**
// 	 * The date the customer was last modified, as GMT.
// 	 */
// 	date_modified_gmt: string

// 	/**
// 	 * The email address for the customer.
// 	 */
// 	email: string

// 	/**
// 	 * Customer first name.
// 	 */
// 	first_name: string

// 	/**
// 	 * Customer last name.
// 	 */
// 	last_name: string

// 	/**
// 	 * Customer role.
// 	 */
// 	role: string

// 	/**
// 	 * Customer login name.
// 	 */
// 	username: string

// 	/**
// 	 * List of billing address data.
// 	 */
// 	billing: WP_BillingAddress

// 	/**
// 	 * List of shipping address data.
// 	 */
// 	shipping: WP_ShippingAddress

// 	/**
// 	 * Is the customer a paying customer?
// 	 */
// 	is_paying_customer: boolean

// 	/**
// 	 * Avatar URL.
// 	 */
// 	avatar_url: string

// 	/**
// 	 * Meta data.
// 	 */
// 	meta_data: WC_Metadata[]

// 	/**
// 	 * Additional data.
// 	 */
// 	kizlo: {
// 		locale: string
// 		nickname: string
// 		description: string
// 		display_name: string
// 	}
// }

// export interface WP_BillingAddress {
// 	/**
// 	 * First name.
// 	 */
// 	first_name: string

// 	/**
// 	 * Last name.
// 	 */
// 	last_name: string

// 	/**
// 	 * Company name.
// 	 */
// 	company: string

// 	/**
// 	 * Address line 1
// 	 */
// 	address_1: string

// 	/**
// 	 * Address line 2
// 	 */
// 	address_2: string

// 	/**
// 	 * City name.
// 	 */
// 	city: string

// 	/**
// 	 * ISO code or name of the state, province or district.
// 	 */
// 	state: string

// 	/**
// 	 * Postal code.
// 	 */
// 	postcode: string

// 	/**
// 	 * ISO code of the country.
// 	 */
// 	country: string

// 	/**
// 	 * Email address.
// 	 */
// 	email: string

// 	/**
// 	 * Phone number.
// 	 */
// 	phone: string
// }

// export interface WP_ShippingAddress {
// 	/**
// 	 * First name.
// 	 */
// 	first_name: string

// 	/**
// 	 * Last name.
// 	 */
// 	last_name: string

// 	/**
// 	 * Company name.
// 	 */
// 	company: string

// 	/**
// 	 * Address line 1
// 	 */
// 	address_1: string

// 	/**
// 	 * Address line 2
// 	 */
// 	address_2: string

// 	/**
// 	 * City name.
// 	 */
// 	city: string

// 	/**
// 	 * ISO code or name of the state, province or district.
// 	 */
// 	state: string

// 	/**
// 	 * Postal code.
// 	 */
// 	postcode: string

// 	/**
// 	 * ISO code of the country.
// 	 */
// 	country: string

// 	/**
// 	 * Phone number.
// 	 */
// 	phone: string
// }

// export type WP_UpdateCustomerInput = Partial<{
// 	email: string
// 	first_name: string
// 	last_name: string
// 	password: string
// 	billing: Partial<WP_BillingAddress>
// 	shipping: Partial<WP_ShippingAddress>
// 	meta_data: WC_Metadata[]
// 	avatar_url: string
// }>

// export interface WC_Metadata {
// 	key: string
// 	value: string
// }

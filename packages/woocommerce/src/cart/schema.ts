import { MediaImage } from "@kizlo/shared"
import { CurrencyFormat } from "kizlo"
import z from "zod/v4"
import { ProductCustomFieldsSchema, ProductPrices, ProductSummary } from "../product/schema"
import type { ProductCustomFields } from "../product/types"

export const CartAdditionalFields = z.record(z.string(), z.union([z.string(), z.boolean()]))
export type CartAdditionalFields = z.infer<typeof CartAdditionalFields>

const CartAddressFields = {
	firstName: z.string(),
	lastName: z.string(),
	company: z.string(),
	address1: z.string(),
	address2: z.string(),
	city: z.string(),
	state: z.string(),
	postcode: z.string(),
	country: z.string(),
	phone: z.string(),
	additionalFields: CartAdditionalFields,
}

export const CartShippingAddress = z.object(CartAddressFields)
export type CartShippingAddress = z.infer<typeof CartShippingAddress>

export const CartBillingAddress = z.object({ ...CartAddressFields, email: z.string() })
export type CartBillingAddress = z.infer<typeof CartBillingAddress>

export const CartShippingDestination = z.object({
	address1: z.string(),
	address2: z.string(),
	city: z.string(),
	state: z.string(),
	postcode: z.string(),
	country: z.string(),
})
export type CartShippingDestination = z.infer<typeof CartShippingDestination>

export const CartShippingItem = z.object({ key: z.string(), name: z.string(), quantity: z.number() })
export type CartShippingItem = z.infer<typeof CartShippingItem>

export const CartShippingRateMetadata = z.object({ key: z.string(), value: z.string() })
export type CartShippingRateMetadata = z.infer<typeof CartShippingRateMetadata>

export const CartShippingRate = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string(),
	deliveryTime: z.string(),
	price: z.number(),
	taxes: z.number(),
	methodId: z.string(),
	instanceId: z.number(),
	metadata: z.array(CartShippingRateMetadata),
	selected: z.boolean(),
})
export type CartShippingRate = z.infer<typeof CartShippingRate>

export const CartShippingPackage = z.object({
	id: z.union([z.number(), z.string()]),
	name: z.string(),
	destination: CartShippingDestination,
	items: z.array(CartShippingItem),
	rates: z.array(CartShippingRate),
})
export type CartShippingPackage = z.infer<typeof CartShippingPackage>

export const CartSelectedAttribute = z.object({ name: z.string(), attribute: z.string(), value: z.string() })
export type CartSelectedAttribute = z.infer<typeof CartSelectedAttribute>

export const CartItemData = z.object({ name: z.string(), value: z.string(), display: z.string().nullable() })
export type CartItemData = z.infer<typeof CartItemData>

export const CartItemQuantityLimits = z.object({
	minimum: z.number(),
	maximum: z.number(),
	multipleOf: z.number(),
	editable: z.boolean(),
})
export type CartItemQuantityLimits = z.infer<typeof CartItemQuantityLimits>

export const CartItemTotals = z.object({
	subtotal: z.number(),
	subtotalTax: z.number(),
	total: z.number(),
	totalTax: z.number(),
})
export type CartItemTotals = z.infer<typeof CartItemTotals>

export const CartItem = z.object({
	key: z.string(),
	productId: z.number(),
	variationId: z.number().nullable(),
	type: z.string(),
	name: z.string(),
	sku: z.string().nullable(),
	slug: z.string(),
	url: z.string().nullable(),
	shortDescription: z.string(),
	description: z.string(),
	quantity: z.number(),
	quantityLimits: CartItemQuantityLimits,
	lowStockRemaining: z.number().nullable(),
	allowsBackorders: z.boolean(),
	showsBackorderBadge: z.boolean(),
	isSoldIndividually: z.boolean(),
	catalogVisibility: z.string(),
	images: z.array(MediaImage),
	selectedAttributes: z.array(CartSelectedAttribute),
	itemData: z.array(CartItemData),
	prices: ProductPrices,
	totals: CartItemTotals,
	custom: ProductCustomFieldsSchema,
	extensions: z.record(z.string(), z.unknown()),
})
export type CartItem = Omit<z.infer<typeof CartItem>, "custom"> & { custom: ProductCustomFields }

export const CartCouponTotals = z.object({ discount: z.number(), discountTax: z.number() })
export type CartCouponTotals = z.infer<typeof CartCouponTotals>

export const CartCoupon = z.object({ code: z.string(), discountType: z.string(), totals: CartCouponTotals })
export type CartCoupon = z.infer<typeof CartCoupon>

export const CartFeeTotals = z.object({ total: z.number(), tax: z.number() })
export type CartFeeTotals = z.infer<typeof CartFeeTotals>

export const CartFee = z.object({ id: z.string(), name: z.string(), totals: CartFeeTotals })
export type CartFee = z.infer<typeof CartFee>

export const CartTaxLine = z.object({ name: z.string(), price: z.number(), rate: z.string() })
export type CartTaxLine = z.infer<typeof CartTaxLine>

export const CartTotals = z.object({
	itemsTotal: z.number(),
	itemsTaxTotal: z.number(),
	feesTotal: z.number(),
	feesTaxTotal: z.number(),
	discountTotal: z.number(),
	discountTaxTotal: z.number(),
	shippingTotal: z.number().nullable(),
	shippingTaxTotal: z.number().nullable(),
	total: z.number(),
	taxTotal: z.number(),
	taxLines: z.array(CartTaxLine),
})
export type CartTotals = z.infer<typeof CartTotals>

export const CartError = z.object({ code: z.string(), message: z.string() })
export type CartError = z.infer<typeof CartError>

export const Cart = z.object({
	items: z.array(CartItem),
	itemCount: z.number(),
	itemsWeight: z.number(),
	billingAddress: CartBillingAddress,
	shippingAddress: CartShippingAddress,
	shippingPackages: z.array(CartShippingPackage),
	coupons: z.array(CartCoupon),
	fees: z.array(CartFee),
	crossSells: z.array(ProductSummary),
	needsPayment: z.boolean(),
	needsShipping: z.boolean(),
	hasCalculatedShipping: z.boolean(),
	paymentMethods: z.array(z.string()),
	paymentRequirements: z.array(z.string()),
	errors: z.array(CartError),
	totals: CartTotals,
	currencyFormat: CurrencyFormat,
	extensions: z.record(z.string(), z.unknown()),
})
export type Cart = Omit<z.infer<typeof Cart>, "items"> & { items: CartItem[] }

export const AddCartItemInput = z.object({
	productId: z.number(),
	variationId: z.number().optional(),
	quantity: z.number().optional(),
	selectedAttributes: z.array(z.object({ attribute: z.string(), value: z.string() })).optional(),
})
export type AddCartItemInput = z.infer<typeof AddCartItemInput>

export const UpdateCartItemInput = z.object({ key: z.string(), quantity: z.number() })
export type UpdateCartItemInput = z.infer<typeof UpdateCartItemInput>

export const RemoveCartItemInput = z.object({ key: z.string() })
export type RemoveCartItemInput = z.infer<typeof RemoveCartItemInput>

export const ApplyCouponInput = z.object({ code: z.string() })
export type ApplyCouponInput = z.infer<typeof ApplyCouponInput>

export const RemoveCouponInput = z.object({ code: z.string() })
export type RemoveCouponInput = z.infer<typeof RemoveCouponInput>

export const SelectCartShippingRateInput = z.object({
	rateId: z.string(),
	packageId: z.union([z.number(), z.string()]).nullable().optional(),
})
export type SelectCartShippingRateInput = z.infer<typeof SelectCartShippingRateInput>

const CartShippingAddressInput = z.object(CartAddressFields).partial()
const CartBillingAddressInput = z.object({ ...CartAddressFields, email: z.string() }).partial()

export const UpdateCartInput = z.object({
	shippingAddress: CartShippingAddressInput.optional(),
	billingAddress: CartBillingAddressInput.optional(),
})
export type UpdateCartInput = z.input<typeof UpdateCartInput>

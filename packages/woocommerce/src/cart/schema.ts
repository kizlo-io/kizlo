import { CurrencyFormat, Media } from "kizlo"
import z from "zod/v4"
import { ProductPrices } from "../product/schema"
import { BillingAddress, ItemTotals, ShippingAddress, Totals } from "../schema"

export const CART_ITEM_STATUSES = ["insufficient_stock", "low_stock", "out_of_stock", "unavailable", "available"] as const
export const CartLineItemStatus = z.enum(CART_ITEM_STATUSES)
export type CartLineItemStatus = z.infer<typeof CartLineItemStatus>

export const PackageAddress = z.object({
	address1: z.string(),
	address2: z.string(),
	city: z.string(),
	state: z.string(),
	postcode: z.string(),
	country: z.string(),
})
export type PackageAddress = z.infer<typeof PackageAddress>

export const CartPackageItem = z.object({
	key: z.string(),
	name: z.string(),
	quantity: z.number(),
})
export type CartPackageItem = z.infer<typeof CartPackageItem>

export const CartPackageRate = z.object({
	id: z.string(),
	methodId: z.string(),
	name: z.string(),
	isSelected: z.boolean(),
	description: z.string(),
	deliveryTime: z.string(),
	amount: z.number(),
	taxAmount: z.number(),
	total: z.number(),
})
export type CartPackageRate = z.infer<typeof CartPackageRate>

export const CartPackageLine = z.object({
	id: z.number(),
	name: z.string(),
	address: PackageAddress,
	items: z.array(CartPackageItem),
	rates: z.array(CartPackageRate),
})
export type CartPackageLine = z.infer<typeof CartPackageLine>

export const CartItemVariation = z.object({
	name: z.string(),
	attribute: z.string(),
	value: z.string(),
})
export type CartItemVariation = z.infer<typeof CartItemVariation>

export const CartItem = z.object({
	key: z.string(),
	type: z.string(),
	status: CartLineItemStatus,
	productId: z.number(),
	variationId: z.number().nullable(),
	name: z.string(),
	description: z.string(),
	shortDescription: z.string(),
	sku: z.string(),
	slug: z.string(),
	lowStockCount: z.number().nullable(),
	isSoldIndividually: z.boolean(),
	images: z.array(Media),
	variations: z.array(CartItemVariation),
	prices: ProductPrices,
	quantity: z.number(),
	totals: ItemTotals,
})
export type CartItem = z.infer<typeof CartItem>

export const AddCartItemInput = z.object({
	productId: z.number(),
	quantity: z.number(),
	variations: z
		.array(
			z.object({
				attribute: z.string(),
				value: z.string(),
			}),
		)
		.optional(),
})
export type AddCartItemInput = z.infer<typeof AddCartItemInput>

export const UpdateCartItemInput = z.object({
	key: z.string(),
	quantity: z.number(),
})
export type UpdateCartItemInput = z.infer<typeof UpdateCartItemInput>

export const RemoveCartItemInput = z.object({
	key: z.string(),
})
export type RemoveCartItemInput = z.infer<typeof RemoveCartItemInput>

export const CartCouponLine = z.object({
	id: z.string(),
	type: z.string(),
	code: z.string(),
	amount: z.number(),
	taxAmount: z.number(),
})
export type CartCouponLine = z.infer<typeof CartCouponLine>

export const ApplyCouponInput = z.object({
	code: z.string(),
})
export type ApplyCouponInput = z.infer<typeof ApplyCouponInput>

export const RemoveCouponInput = z.object({
	code: z.string(),
})
export type RemoveCouponInput = z.infer<typeof RemoveCouponInput>

export const CartShippingLine = z.object({
	id: z.string(),
	label: z.string(),
	amount: z.number(),
	taxAmount: z.number(),
})
export type CartShippingLine = z.infer<typeof CartShippingLine>

export const CartShippingAddress = ShippingAddress.extend({
	id: z.string().optional(),
})
export type CartShippingAddress = z.infer<typeof CartShippingAddress>

export const CartBillingAddress = BillingAddress.extend({
	id: z.string().optional(),
})
export type CartBillingAddress = z.infer<typeof CartBillingAddress>

export const Cart = z.object({
	totalItems: z.number(),
	lineItems: z.array(CartItem),
	billing: CartBillingAddress.nullable(),
	shipping: CartShippingAddress.nullable(),
	packageLines: z.array(CartPackageLine),
	couponLines: z.array(CartCouponLine),
	shippingLines: z.array(CartShippingLine),
	currencyFormat: CurrencyFormat,
	totals: Totals,
})
export type Cart = z.infer<typeof Cart>

export const SelectCartShippingRateInput = z.object({
	rateId: z.string(),
	packageId: z.number(),
})
export type SelectCartShippingRateInput = z.infer<typeof SelectCartShippingRateInput>

const AddressInput = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) => {
	return schema.extend({
		id: z.string().optional(),
	})
}

export const UpdateCartInput = z.object({
	shipping: AddressInput(ShippingAddress).nullable().optional(),
	billing: AddressInput(BillingAddress).nullable().optional(),
})
export type UpdateCartInput = z.input<typeof UpdateCartInput>

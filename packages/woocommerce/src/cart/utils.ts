import { deserializeCurrencyFormat } from "kizlo"
import type {
	Cart,
	CartBillingAddress,
	CartCouponLine,
	CartItem,
	CartLineItemStatus,
	CartPackageItem,
	CartPackageLine,
	CartPackageRate,
	CartShippingAddress,
	CartShippingLine,
} from "./schema"
import type { WCS_Cart } from "./types.wcs"

export function deserializeCart(data: WCS_Cart): Cart {
	const lineItems = data.items.map<CartItem>((item) => {
		const totals = calculateLineItemTotals({
			quantity: item.quantity,
			subtotal: Number(item.totals.line_subtotal),
			subtotal_tax: Number(item.totals.line_subtotal_tax),
			total: Number(item.totals.line_total),
			total_tax: Number(item.totals.line_total_tax),
		})

		let itemStatus: CartLineItemStatus = "available"

		const error = data.errors.find((e) => e.message.includes(item.name))

		if (error) {
			switch (error.code) {
				case "woocommerce_rest_product_out_of_stock": {
					itemStatus = "out_of_stock"
					break
				}
				case "woocommerce_rest_cart_item_error": {
					itemStatus = "unavailable"
					break
				}
			}
		}

		if (item.low_stock_remaining) itemStatus = "low_stock"

		const productSlug = new URL(item.permalink).pathname

		return {
			key: item.key,
			productId: item.id,
			variationId: null,
			type: item.type,
			name: item.name,
			sku: item.sku,
			status: itemStatus,
			quantity: item.quantity,
			isSoldIndividually: item.sold_individually,
			images: item.images.map((item) => ({
				id: item.id,
				name: item.name,
				alt: item.alt,
				src: item.src,
			})),
			variations: item.variation.map((a) => ({
				name: a.attribute,
				attribute: a.raw_attribute,
				value: a.value,
			})),
			slug: productSlug,
			description: item.description,
			soldIndividually: item.sold_individually,
			lowStockCount: item.low_stock_remaining,
			prices: {
				price: Number(item.prices.price),
				salePrice: Number(item.prices.sale_price),
				regularPrice: Number(item.prices.regular_price),
			},
			totals,
			shortDescription: item.short_description,
		}
	})

	const couponLines = data.coupons.map<CartCouponLine>((coupon) => {
		return {
			id: coupon.code,
			code: coupon.code,
			type: coupon.discount_type,
			amount: Number(coupon.totals.total_discount),
			taxAmount: Number(coupon.totals.total_discount_tax),
		}
	})

	const packageLines = data.shipping_rates.map<CartPackageLine>((pkg) => ({
		id: Number(pkg.package_id),
		name: pkg.name,
		address: {
			address1: pkg.destination.address_1,
			address2: pkg.destination.address_2,
			city: pkg.destination.city,
			state: pkg.destination.state,
			postcode: pkg.destination.postcode,
			country: pkg.destination.country,
		},
		items: pkg.items.map<CartPackageItem>((item) => ({
			key: item.key,
			name: item.name,
			quantity: item.quantity,
		})),
		rates: pkg.shipping_rates.map<CartPackageRate>((rate) => ({
			id: rate.rate_id,
			name: rate.name,
			description: rate.description,
			deliveryTime: rate.delivery_time,
			amount: Number(rate.price),
			taxAmount: Number(rate.taxes),
			total: Number(rate.price) + Number(rate.taxes),
			isSelected: rate.selected,
			methodId: rate.method_id,
		})),
	}))

	const shippingLines = packageLines.reduce<CartShippingLine[]>((acc, item) => {
		const found = item.rates.find((a) => a.isSelected)

		if (found) {
			acc.push({
				id: found.id,
				label: found.name,
				amount: found.amount,
				taxAmount: found.taxAmount,
			})
		}

		return acc
	}, [])

	const discountTotal = Number(data.totals.total_discount)
	const discountTaxTotal = Number(data.totals.total_discount_tax)
	const shippingTotal = Number(data.totals.total_shipping)
	const shippingTaxTotal = Number(data.totals.total_shipping_tax)
	const feeTotal = Number(data.totals.total_fees)
	const feeTaxTotal = Number(data.totals.total_fees_tax)
	const taxTotal = Number(data.totals.total_tax)
	const total = Number(data.totals.total_price)

	return {
		lineItems,
		couponLines,
		packageLines,
		shippingLines,
		totalItems: data.items_count,
		billing: data.billing_address.address_1.length ? deserializeCartBillingAddress(data) : null,
		shipping: data.shipping_address.address_1.length ? deserializeCartShippingAddress(data) : null,
		currencyFormat: deserializeCurrencyFormat(data.totals),
		totals: {
			discountTotal,
			discountTaxTotal,
			shippingTotal,
			shippingTaxTotal,
			feeTotal,
			feeTaxTotal,
			taxTotal,
			total,
		},
	}
}

function deserializeCartShippingAddress(cart: WCS_Cart): CartShippingAddress {
	return {
		address1: cart.shipping_address.address_1,
		address2: cart.shipping_address.address_2,
		city: cart.shipping_address.city,
		company: cart.shipping_address.company,
		country: cart.shipping_address.country,
		firstName: cart.shipping_address.first_name,
		lastName: cart.shipping_address.last_name,
		phone: cart.shipping_address.phone,
		postcode: cart.shipping_address.postcode,
		state: cart.shipping_address.state,
	}
}

function deserializeCartBillingAddress(cart: WCS_Cart): CartBillingAddress {
	return {
		address1: cart.billing_address.address_1,
		address2: cart.billing_address.address_2,
		city: cart.billing_address.city,
		company: cart.billing_address.company,
		country: cart.billing_address.country,
		firstName: cart.billing_address.first_name,
		lastName: cart.billing_address.last_name,
		phone: cart.billing_address.phone,
		postcode: cart.billing_address.postcode,
		state: cart.billing_address.state,
		email: cart.billing_address.email,
	}
}

interface LineItemTotals {
	unitPrice: number
	grossAmount: number
	discountAmount: number
	discountTaxAmount: number
	netAmount: number
	taxAmount: number
	total: number
}

interface LineItemTotalsInput {
	quantity: number
	subtotal: number
	subtotal_tax: number
	total_tax: number
	total: number
}

function calculateLineItemTotals(input: LineItemTotalsInput): LineItemTotals {
	const unitPrice = input.subtotal / input.quantity
	const grossAmount = input.subtotal
	const discountAmount = input.subtotal - input.total
	const discountTaxAmount = input.subtotal_tax - input.total_tax
	const netAmount = input.total
	const taxAmount = input.total_tax
	const total = input.total + input.total_tax

	return {
		unitPrice,
		discountAmount,
		discountTaxAmount,
		grossAmount,
		netAmount,
		taxAmount,
		total,
	}
}

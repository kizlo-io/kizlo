import { apiFetch } from "./api"

export type Address = Record<string, string>
export type Contact = { first_name: string; last_name: string; email: string; phone: string }
export type CartLine = { id: number; quantity: number; name: string }
export type CheckoutInput = {
	items: { id: number; quantity: number }[]
	contact: Contact
	billing: Address
	shipping: Address
	rates: string[]
}
export type CheckoutConfig = {
	fields: Record<keyof Contact | "billing" | "shipping", boolean>
	handoff: { device: boolean; send: boolean; default: "device" | "send" }
	store_address: Address
	countries: Record<string, string>
	states: Record<string, Record<string, string> | []>
	address_fields: Record<"billing" | "shipping", Record<string, { label: string; required?: boolean; hidden?: boolean; type?: string }>>
	channels: { id: string; label: string }[]
	currency: string
}
export type Quote = {
	items: { id: number; name: string; quantity: number; total: string }[]
	total: string
	tax: string
	shipping_total: string
	currency: string
	decimals: number
	fingerprint: string
	sources: { billing: string; shipping: string }
	rates: { id: string; label: string; cost: string }[][]
	chosen_rates: string[]
	cash: boolean
	online: string[]
}
export type SaleStatus = {
	sale_id: string
	order_id: number
	status: string
	paid: boolean
	needs_payment: boolean
	payment_url: string | null
	total: string
	currency: string
	decimals: number
	admin_url: string
	billing_email: string
	billing_phone: string
	deliveries: Record<string, { channel: string; event: string; status: string }>
	channels: { id: string; label: string; unavailable: string | null }[]
}
export const checkoutConfig = (country = "") =>
	apiFetch<CheckoutConfig>({ path: `/kizlo/v1/pos/checkout/config?${new URLSearchParams({ country })}` })
export const lookupBarcode = (code: string) =>
	apiFetch<{ id: number; parent_id: number | null; type: string }>({ path: `/kizlo/v1/pos/barcode?${new URLSearchParams({ code })}` })
export const scanCart = (code: string, items: CartLine[]) =>
	apiFetch<CartLine>({
		path: "/kizlo/v1/pos/cart/scan",
		method: "POST",
		data: { code, items: items.map(({ id, quantity }) => ({ id, quantity })) },
	})
export const quoteSale = (data: CheckoutInput) => apiFetch<Quote>({ path: "/kizlo/v1/pos/checkout/quote", method: "POST", data })
export const commitSale = (data: CheckoutInput & { sale_id: string; fingerprint: string; method: "cash" | "online" }) =>
	apiFetch<SaleStatus>({ path: "/kizlo/v1/pos/checkout", method: "POST", data })
export const saleStatus = (id: string) => apiFetch<SaleStatus>({ path: `/kizlo/v1/pos/checkout/${id}` })
export const replacePaymentLink = (id: string, request_id: string) =>
	apiFetch<SaleStatus>({ path: `/kizlo/v1/pos/checkout/${id}/payment-link`, method: "POST", data: { request_id } })
export const sendPayment = (id: string, channel: string, request_id: string) =>
	apiFetch<{ status: string }>({ path: `/kizlo/v1/pos/checkout/${id}/notifications`, method: "POST", data: { channel, request_id } })
export const formatMoney = (amount: string, currency: string, decimals: number) =>
	new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(amount) / 10 ** decimals)

import { useQuery } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { apiProblem } from "./api"
import {
	type Address,
	type CheckoutConfig,
	type CheckoutInput,
	type Contact,
	checkoutConfig,
	commitSale,
	formatMoney,
	type Quote,
	quoteSale,
	replacePaymentLink,
	type SaleStatus,
	saleStatus,
	sendPayment,
} from "./checkout-api"
import { Products } from "./Products"
import { useSaleCart } from "./sale-cart"

const emptyContact: Contact = { first_name: "", last_name: "", email: "", phone: "" }

function AddressForm({
	kind,
	value,
	onChange,
	config,
}: {
	kind: "billing" | "shipping"
	value: Address
	onChange: (address: Address) => void
	config: CheckoutConfig
}) {
	const country = value.country || config.store_address.country || ""
	const definitions = useQuery({ queryKey: ["pos", "checkout-config", country], queryFn: () => checkoutConfig(country) })
	const fields = definitions.data?.address_fields[kind]
	return (
		<fieldset className="pos-address">
			<legend>{kind === "billing" ? "Billing address" : "Shipping address"}</legend>
			{definitions.error && <p role="alert">{apiProblem(definitions.error).message}</p>}
			{fields &&
				Object.entries(fields)
					.filter(([key, field]) => !field.hidden && !["email", "phone"].includes(key.replace(`${kind}_`, "")))
					.map(([key, field]) => {
						const name = key.replace(`${kind}_`, "")
						const choices = name === "country" ? config.countries : name === "state" ? config.states[country] : undefined
						return (
							<label key={key} htmlFor={`pos-${key}`}>
								{field.label}
								{field.required ? " *" : ""}
								{choices && Object.keys(choices).length ? (
									<select
										id={`pos-${key}`}
										required={field.required}
										value={value[name] ?? (name === "country" ? country : "")}
										onChange={(event) =>
											onChange({ ...value, country, [name]: event.target.value, ...(name === "country" ? { state: "" } : {}) })
										}
									>
										<option value="">Choose…</option>
										{Object.entries(choices).map(([id, label]) => (
											<option key={id} value={id}>
												{label}
											</option>
										))}
									</select>
								) : (
									<Input
										id={`pos-${key}`}
										value={value[name] ?? ""}
										maxLength={200}
										required={field.required}
										onChange={(event) => onChange({ ...value, country, [name]: event.target.value })}
									/>
								)}
							</label>
						)
					})}
		</fieldset>
	)
}

function PaymentHandoff({ sale, config, refresh }: { sale: SaleStatus; config: CheckoutConfig; refresh: () => Promise<void> }) {
	const [open, setOpen] = useState(false)
	const [host, setHost] = useState<HTMLElement | null>(null)
	const [message, setMessage] = useState("")
	const [sending, setSending] = useState(false)
	const [handoff, setHandoff] = useState(
		config.handoff[config.handoff.default] ? config.handoff.default : config.handoff.device ? "device" : "send",
	)
	const requests = useRef(new Map<string, string>())
	useEffect(() => {
		setHost(document.querySelector<HTMLElement>(".kizlo-pos-app"))
	}, [])
	useEffect(() => {
		const check = () => {
			if (!document.hidden) void refresh()
		}
		const timer = setInterval(check, 5000)
		window.addEventListener("focus", check)
		return () => {
			clearInterval(timer)
			window.removeEventListener("focus", check)
		}
	}, [refresh])
	const send = async (channel: string, resend = false) => {
		if (sending) return
		setSending(true)
		setMessage("")
		const id = (resend ? undefined : requests.current.get(channel)) ?? crypto.randomUUID()
		requests.current.set(channel, id)
		try {
			const response = await sendPayment(sale.sale_id, channel, id)
			setMessage(`Payment request: ${response.status}. Payment is still awaiting confirmation.`)
			await refresh()
		} catch (error) {
			setMessage(apiProblem(error).message)
		} finally {
			setSending(false)
		}
	}
	return (
		<div className="pos-payment-handoff">
			<p>Payment is awaiting confirmation. Opening or sending a link does not mark this order paid.</p>
			{config.handoff.device && config.handoff.send && (
				<label htmlFor="pos-handoff">
					Payment handoff
					<select id="pos-handoff" value={handoff} onChange={(event) => setHandoff(event.target.value === "device" ? "device" : "send")}>
						<option value="device">This device</option>
						<option value="send">Send to customer</option>
					</select>
				</label>
			)}
			{handoff === "device" && config.handoff.device && sale.payment_url && (
				<>
					<Button type="button" onClick={() => setOpen(true)}>
						Open payment
					</Button>
					<a href={sale.payment_url} target="_blank" rel="noreferrer">
						Open in a separate page
					</a>
				</>
			)}
			{handoff === "send" &&
				config.handoff.send &&
				sale.channels.map((channel) => (
					<div key={channel.id}>
						<Button
							type="button"
							variant="outline"
							disabled={
								sending ||
								channel.unavailable !== null ||
								Object.values(sale.deliveries).some(
									(delivery) => delivery.channel === channel.id && ["queued", "unknown"].includes(delivery.status),
								)
							}
							onClick={() => void send(channel.id)}
						>
							Send via {channel.label}
						</Button>
						{channel.unavailable && <p>{channel.unavailable}</p>}
					</div>
				))}
			{message && <p role="status">{message}</p>}
			{Object.entries(sale.deliveries).map(([id, delivery]) => (
				<div key={id}>
					<p>
						{delivery.channel}: {delivery.status}
					</p>
					{["accepted", "sent", "failed"].includes(delivery.status) && (
						<Button type="button" variant="outline" disabled={sending} onClick={() => void send(delivery.channel, true)}>
							Send another request via {delivery.channel}
						</Button>
					)}
				</div>
			))}
			<Button type="button" variant="outline" onClick={() => void refresh()}>
				Check payment status
			</Button>
			<Button
				type="button"
				variant="outline"
				onClick={() => {
					void replacePaymentLink(sale.sale_id, crypto.randomUUID())
						.then(refresh)
						.catch((failure) => setMessage(apiProblem(failure).message))
				}}
			>
				Replace payment link (invalidates previous link)
			</Button>
			<Sheet open={open && !sale.paid} onOpenChange={setOpen}>
				<SheetContent container={host} className="pos-payment-sheet" side="bottom">
					<SheetTitle>Pay for order #{sale.order_id}</SheetTitle>
					<SheetDescription>If the gateway cannot open here, use the separate payment page.</SheetDescription>
					{sale.payment_url && (
						<>
							<a href={sale.payment_url} target="_blank" rel="noreferrer">
								Open payment in a separate page
							</a>
							<iframe src={sale.payment_url} title={`Payment for order ${sale.order_id}`} referrerPolicy="no-referrer" allow="payment" />
						</>
					)}
				</SheetContent>
			</Sheet>
		</div>
	)
}

export function Sell({ theme, onToggleTheme, loginUrl }: { theme: string; onToggleTheme: () => void; loginUrl: string }) {
	const { draft, setDraft, add, reset } = useSaleCart()
	const configQuery = useQuery({ queryKey: ["pos", "checkout-config"], queryFn: () => checkoutConfig() })
	const config = configQuery.data
	const [contact, setContact] = useState<Contact>(emptyContact)
	const [billing, setBilling] = useState<Address>({})
	const [shipping, setShipping] = useState<Address>({})
	const [rates, setRates] = useState<string[]>([])
	const [quote, setQuote] = useState<Quote | null>(null)
	const [reviewedInput, setReviewedInput] = useState<CheckoutInput | null>(null)
	const [sale, setSale] = useState<SaleStatus | null>(null)
	const [error, setError] = useState("")
	const [busy, setBusy] = useState(false)
	const lock = useRef(false)
	const [cartOpen, setCartOpen] = useState(false)
	const refresh = async () => {
		try {
			setSale(await saleStatus(draft.saleId))
			setError("")
		} catch (failure) {
			setError(apiProblem(failure).message)
			if ((failure as { data?: { status?: number } }).data?.status === 404) setDraft((state) => ({ ...state, submitted: false }))
		}
	}
	const refreshRef = useRef(refresh)
	refreshRef.current = refresh
	useEffect(() => {
		if (draft.submitted) void refreshRef.current()
	}, [draft.submitted, draft.saleId])
	useEffect(() => {
		setQuote(null)
		setReviewedInput(null)
	}, [draft.items, contact, billing, shipping, rates])
	const review = async () => {
		if (lock.current) return
		lock.current = true
		setBusy(true)
		setError("")
		const input: CheckoutInput = { items: draft.items.map(({ id, quantity }) => ({ id, quantity })), contact, billing, shipping, rates }
		try {
			setQuote(await quoteSale(input))
			setReviewedInput(input)
		} catch (failure) {
			setError(apiProblem(failure).message)
			void configQuery.refetch()
		} finally {
			lock.current = false
			setBusy(false)
		}
	}
	const submit = async (method: "cash" | "online") => {
		if (lock.current || !quote || !reviewedInput || draft.submitted) return
		lock.current = true
		setBusy(true)
		setError("")
		// Persist the recovery pointer before sending; a timeout must never make the UI create a second sale.
		setDraft((state) => ({ ...state, submitted: true }))
		try {
			setSale(await commitSale({ ...reviewedInput, sale_id: draft.saleId, fingerprint: quote.fingerprint, method }))
		} catch (failure) {
			const value = failure as { data?: { status?: number; quote?: Quote; uncertain?: boolean } }
			if (value.data?.status && value.data.status < 500 && !value.data.uncertain) {
				try {
					setSale(await saleStatus(draft.saleId))
				} catch (statusFailure) {
					if ((statusFailure as { data?: { status?: number } }).data?.status === 404) setDraft((state) => ({ ...state, submitted: false }))
				}
			}
			if (value.data?.quote) {
				setQuote(value.data.quote)
				setReviewedInput(null)
			}
			setError(apiProblem(failure).message)
		} finally {
			lock.current = false
			setBusy(false)
		}
	}
	const newSale = () => {
		reset()
		setSale(null)
		setQuote(null)
		setReviewedInput(null)
		setContact(emptyContact)
		setBilling({})
		setShipping({})
		setRates([])
		setError("")
	}
	if (!config)
		return (
			<section>
				<p role="status">{configQuery.error ? apiProblem(configQuery.error).message : "Loading checkout…"}</p>
				<Button type="button" onClick={() => void configQuery.refetch()}>
					Retry
				</Button>
			</section>
		)
	return (
		<section className="pos-sell" aria-label="Sell">
			<div className="pos-sell-catalog" inert={draft.submitted}>
				<Products
					selling
					onSelect={(product) => {
						try {
							add(product)
						} catch (failure) {
							setError(apiProblem(failure).message)
							setCartOpen(true)
						}
					}}
					theme={theme}
					onToggleTheme={onToggleTheme}
					loginUrl={loginUrl}
				/>
			</div>
			<Button type="button" variant="outline" className="pos-cart-toggle" onClick={() => setCartOpen(!cartOpen)}>
				{cartOpen ? "Back to products" : `View cart (${draft.items.reduce((sum, item) => sum + item.quantity, 0)})`}
			</Button>
			<div className={`pos-sale-cart ${cartOpen ? "is-open" : ""}`}>
				<h2>Current sale</h2>
				{error && (
					<p role="alert" className="pos-error">
						{error}
					</p>
				)}
				{draft.submitted ? (
					sale ? (
						<>
							<h3>Order #{sale.order_id}</h3>
							<p role="status">
								{sale.paid ? "Paid" : sale.status} · {formatMoney(sale.total, sale.currency, sale.decimals)}
							</p>
							{sale.needs_payment && <PaymentHandoff sale={sale} config={config} refresh={refresh} />}
							<a href={sale.admin_url} target="_blank" rel="noreferrer">
								Review order in WooCommerce
							</a>
							<Button type="button" onClick={newSale}>
								{sale.paid ? "Next sale" : "Keep this order and start next sale"}
							</Button>
						</>
					) : (
						<>
							<p>The submission outcome needs checking. Do not collect payment again.</p>
							<Button type="button" onClick={() => void refresh()}>
								Recover sale status
							</Button>
						</>
					)
				) : (
					<form
						onSubmit={(event) => {
							event.preventDefault()
							void review()
						}}
					>
						{draft.items.length === 0 && <p>Scan a barcode or choose an item from the catalog.</p>}
						{draft.items.map((item) => (
							<div className="pos-sale-line" key={item.id}>
								<label htmlFor={`pos-quantity-${item.id}`}>{item.name}</label>
								<Input
									id={`pos-quantity-${item.id}`}
									type="number"
									min={1}
									max={10000}
									step={1}
									value={item.quantity}
									onChange={(event) => {
										const quantity = Number(event.target.value)
										if (Number.isInteger(quantity) && quantity > 0 && quantity <= 10000)
											setDraft((state) => ({
												...state,
												items: state.items.map((line) => (line.id === item.id ? { ...line, quantity } : line)),
											}))
									}}
								/>
								<Button
									type="button"
									variant="ghost"
									onClick={() => setDraft((state) => ({ ...state, items: state.items.filter((line) => line.id !== item.id) }))}
								>
									Remove
								</Button>
							</div>
						))}
						{(Object.keys(emptyContact) as (keyof Contact)[])
							.filter((field) => config.fields[field])
							.map((field) => (
								<label key={field} htmlFor={`pos-contact-${field}`}>
									{field.replace("_", " ")}
									<Input
										id={`pos-contact-${field}`}
										type={field === "email" ? "email" : field === "phone" ? "tel" : "text"}
										required
										maxLength={200}
										value={contact[field]}
										onChange={(event) => setContact({ ...contact, [field]: event.target.value })}
									/>
								</label>
							))}
						{config.fields.billing && <AddressForm kind="billing" value={billing} onChange={setBilling} config={config} />}
						{config.fields.shipping && (
							<>
								<AddressForm kind="shipping" value={shipping} onChange={setShipping} config={config} />
								{config.fields.billing && (
									<Button type="button" variant="outline" onClick={() => setShipping({ ...billing })}>
										Copy billing address
									</Button>
								)}
							</>
						)}
						{!config.fields.shipping && (
							<p>Shipping destination defaults to the store address. Shipping charges and tax are calculated at review.</p>
						)}
						<Button type="submit" disabled={busy || !draft.items.length}>
							Review sale
						</Button>
						{rates.length > 0 && (
							<Button type="button" variant="outline" onClick={() => setRates([])}>
								Reset shipping choice
							</Button>
						)}
						{quote && (
							<section className="pos-sale-review" aria-label="Sale review">
								{quote.items.map((item) => (
									<p key={item.id}>
										{item.name} × {item.quantity} <strong>{formatMoney(item.total, quote.currency, quote.decimals)}</strong>
									</p>
								))}
								{quote.rates.map((packageRates, index) => (
									<label key={packageRates[0]?.id ?? index} htmlFor={`pos-shipping-rate-${index}`}>
										Shipping option
										<select
											id={`pos-shipping-rate-${index}`}
											value={rates[index] ?? quote.chosen_rates[index]}
											onChange={(event) =>
												setRates((previous) => {
													const next = [...previous]
													next[index] = event.target.value
													return next
												})
											}
										>
											{packageRates.map((rate) => (
												<option key={rate.id} value={rate.id}>
													{rate.label} · {formatMoney(rate.cost, quote.currency, quote.decimals)}
												</option>
											))}
										</select>
									</label>
								))}
								<p>Shipping: {formatMoney(quote.shipping_total, quote.currency, quote.decimals)}</p>
								<p>Tax included in total: {formatMoney(quote.tax, quote.currency, quote.decimals)}</p>
								<p className="pos-sale-total">Total: {formatMoney(quote.total, quote.currency, quote.decimals)}</p>
								<Button type="button" disabled={busy || !reviewedInput || !quote.cash} onClick={() => void submit("cash")}>
									Confirm cash collected · {formatMoney(quote.total, quote.currency, quote.decimals)}
								</Button>
								<Button
									type="button"
									variant="outline"
									disabled={busy || !reviewedInput || !quote.online.length || (!config.handoff.device && !config.handoff.send)}
									onClick={() => void submit("online")}
								>
									Pay online
								</Button>
								{!quote.cash && <p>Cash is unavailable. Check the store’s COD configuration.</p>}
								{!quote.online.length && <p>No online gateway is available for this sale.</p>}
							</section>
						)}
					</form>
				)}
			</div>
		</section>
	)
}

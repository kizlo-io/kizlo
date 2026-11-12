import {
	ArrowClockwiseIcon,
	ArrowRightIcon,
	CaretLeftIcon,
	ClockCounterClockwiseIcon,
	CubeIcon,
	HouseIcon,
	MinusIcon,
	MoonIcon,
	PlusIcon,
	ScanIcon,
	SealPercentIcon,
	SunIcon,
	TagIcon,
	UserIcon,
	XIcon,
} from "@phosphor-icons/react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useRef, useState } from "react"
import { NavLink, useLocation } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { apiProblem } from "./api"
import {
	type Address,
	type CartLine,
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
import { ProductImage, Products } from "./Products"
import { getProduct } from "./products-api"
import { UserSettings, useSecurity } from "./Security"
import { useSaleCart } from "./sale-cart"

const emptyContact: Contact = { first_name: "", last_name: "", email: "", phone: "" }

const navigationItemClassName =
	"relative compact:m-0 compact:flex grid size-12 compact:h-14 compact:w-full compact:flex-col place-items-center compact:items-center compact:justify-center compact:gap-1 compact:rounded-[10px] rounded-[10px] border-0 bg-transparent compact:p-1 p-0 text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground disabled:cursor-default disabled:opacity-40"
const navigationLinkClassName = cn(
	navigationItemClassName,
	"aria-[current=page]:text-foreground aria-[current=page]:before:absolute aria-[current=page]:before:top-1/2 compact:aria-[current=page]:before:-top-2.25 aria-[current=page]:before:-right-[12.5px] compact:aria-[current=page]:before:right-auto compact:aria-[current=page]:before:left-1/2 aria-[current=page]:before:h-7 compact:aria-[current=page]:before:h-0.75 aria-[current=page]:before:w-0.75 compact:aria-[current=page]:before:w-7 compact:aria-[current=page]:before:-translate-x-1/2 aria-[current=page]:before:-translate-y-1/2 compact:aria-[current=page]:before:translate-y-0 compact:aria-[current=page]:before:rounded-t-none compact:aria-[current=page]:before:rounded-b-sm aria-[current=page]:before:rounded-l-sm aria-[current=page]:before:bg-primary aria-[current=page]:before:content-['']",
)

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
		<fieldset className="pos-address grid gap-3.5 border border-border p-3">
			<legend className="px-1.5">{kind === "billing" ? "Billing address" : "Shipping address"}</legend>
			{definitions.error && (
				<p className="text-[13px]" role="alert">
					{apiProblem(definitions.error).message}
				</p>
			)}
			{fields &&
				Object.entries(fields)
					.filter(([key, field]) => !field.hidden && !["email", "phone"].includes(key.replace(`${kind}_`, "")))
					.map(([key, field]) => {
						const name = key.replace(`${kind}_`, "")
						const choices = name === "country" ? config.countries : name === "state" ? config.states[country] : undefined
						return (
							<label className="grid gap-1.5 text-[13px]" key={key} htmlFor={`pos-${key}`}>
								{field.label}
								{field.required ? " *" : ""}
								{choices && Object.keys(choices).length ? (
									<select
										className="min-h-10.5 w-full rounded-md border border-border bg-background p-2 text-foreground"
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
										className="min-h-10.5 w-full"
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
		<div className="pos-payment-handoff [&_a]:underline! grid gap-3.5">
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
				<SheetContent
					container={host}
					className="pos-payment-sheet max-h-[90dvh] overflow-auto bg-background text-foreground [&_iframe]:mt-3 [&_iframe]:block [&_iframe]:h-[65dvh] [&_iframe]:w-full [&_iframe]:border [&_iframe]:border-border [&_iframe]:bg-white"
					side="bottom"
				>
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

function SaleLine({ item, onQuantity, onRemove }: { item: CartLine; onQuantity: (quantity: number) => void; onRemove: () => void }) {
	const details = useQuery({
		queryKey: ["pos", "product", item.id],
		queryFn: ({ signal }) => getProduct(item.id, signal),
		enabled: item.price === undefined,
	})
	const product = details.data ?? {
		...item,
		type: "simple",
		stock: "instock" as const,
		stock_quantity: null,
		price: item.price ?? null,
		image: item.image ?? null,
	}
	return (
		<div className="pos-sale-line group/line relative mb-3 mobile:mb-3 wide:mb-4 grid grid-cols-[88px_minmax(0,1fr)] mobile:grid-cols-[72px_minmax(0,1fr)] wide:grid-cols-[128px_minmax(0,1fr)] items-center gap-3 mobile:gap-3 wide:gap-4 mobile:rounded-lg rounded-sm border border-border mobile:bg-background mobile:p-3 p-3 wide:p-4">
			<ProductImage
				product={product}
				className="wide:size-32 h-24 mobile:h-22 mobile:w-18 w-22 bg-[#f7f7f7] dark:bg-accent [&_img]:p-1.25"
			/>
			<div className="pos-line-detail flex min-w-0 flex-col justify-between self-stretch">
				<label
					className="wrap-anywhere line-clamp-2 pr-3 mobile:text-[15px]/[1.3] text-sm/[1.3] wide:text-xl/[1.3]"
					htmlFor={`pos-quantity-${item.id}`}
				>
					{product.name}
				</label>
				{product.attributes?.length ? (
					<p className="pos-line-options mt-1.25 mobile:text-xs/[1.35] text-[11px]/[1.35] text-muted-foreground wide:text-sm/[1.35]">
						{product.attributes.map((attribute) => `${attribute.name}: ${attribute.options.join(", ")}`).join("  •  ")}
					</p>
				) : null}
				<div className="pos-line-bottom mobile:mt-1.5 mt-4.5 flex flex-wrap items-center justify-between gap-2 mobile:gap-1">
					<strong className="font-semibold mobile:text-base/normal text-[15px] wide:text-[19px]">{product.price}</strong>
					<div className="pos-quantity-control ml-auto flex items-center has-[input:focus-visible]:rounded-sm has-[input:focus-visible]:bg-accent [&_input::-webkit-inner-spin-button]:m-0 [&_input::-webkit-inner-spin-button]:appearance-none [&_input::-webkit-outer-spin-button]:m-0 [&_input::-webkit-outer-spin-button]:appearance-none">
						<Button
							className="size-6 mobile:h-9 mobile:w-8 rounded-sm p-0 mobile:text-sm/normal text-[15px] shadow-none"
							type="button"
							variant="outline"
							aria-label={`Decrease quantity of ${product.name}`}
							disabled={item.quantity <= 1}
							onClick={() => onQuantity(item.quantity - 1)}
						>
							<MinusIcon aria-hidden="true" />
						</Button>
						<Input
							className="h-6.5 mobile:h-9 mobile:w-8 w-7 border-0 p-0 text-center mobile:text-sm/normal text-xs/normal shadow-none [appearance:textfield]"
							id={`pos-quantity-${item.id}`}
							aria-label={`Quantity of ${product.name}`}
							type="number"
							min={1}
							max={10000}
							step={1}
							value={item.quantity}
							onChange={(event) => onQuantity(Number(event.target.value))}
						/>
						<Button
							className="size-6 mobile:h-9 mobile:w-8 rounded-sm p-0 mobile:text-sm/normal text-[15px] shadow-none"
							type="button"
							variant="outline"
							aria-label={`Increase quantity of ${product.name}`}
							disabled={item.quantity >= 10000}
							onClick={() => onQuantity(item.quantity + 1)}
						>
							<PlusIcon aria-hidden="true" />
						</Button>
					</div>
				</div>
			</div>
			<Button
				type="button"
				variant="ghost"
				className="pos-line-remove absolute top-1.5 right-1.5 mobile:size-7.5 size-6 p-0 text-muted-foreground mobile:opacity-100 opacity-0 group-focus-within/line:opacity-100 group-hover/line:opacity-100 [&_svg]:size-5.5 [@media(hover:none)]:opacity-100"
				aria-label={`Remove ${product.name}`}
				onClick={onRemove}
			>
				<XIcon aria-hidden="true" />
			</Button>
		</div>
	)
}

export function Sell({
	theme,
	onToggleTheme,
	loginUrl,
	userName = "Staff account",
	storeName = "",
	accountUrl,
}: {
	theme: string
	onToggleTheme: () => void
	loginUrl: string
	userName?: string
	storeName?: string
	accountUrl?: string
}) {
	const { draft, setDraft, add, reset } = useSaleCart()
	const pathname = useLocation().pathname
	const browsing = pathname === "/products"
	const settingsPage = pathname === "/settings"
	const security = useSecurity()
	const configQuery = useQuery({ queryKey: ["pos", "checkout-config"], queryFn: () => checkoutConfig() })
	const config = configQuery.data
	const client = useQueryClient()
	const [scannerOpen, setScannerOpen] = useState(false)
	const [mobileCartOpen, setMobileCartOpen] = useState(false)
	const showMobileCart = !browsing && ((mobileCartOpen && draft.items.length > 0) || draft.submitted)
	useEffect(() => {
		if (!draft.items.length || browsing) setMobileCartOpen(false)
	}, [draft.items.length, browsing])
	const cartHeading = useRef<HTMLHeadingElement>(null)
	const continueButton = useRef<HTMLButtonElement>(null)
	const previousCartOpen = useRef(false)
	useEffect(() => {
		if (showMobileCart) cartHeading.current?.focus()
		else if (previousCartOpen.current)
			(browsing ? document.getElementById("pos-main") : (continueButton.current ?? document.getElementById("pos-main")))?.focus()
		previousCartOpen.current = showMobileCart
	}, [showMobileCart, browsing])
	const [customerOpen, setCustomerOpen] = useState(false)
	const [coupon, setCoupon] = useState("")
	const [couponInput, setCouponInput] = useState("")
	const [couponEditing, setCouponEditing] = useState(true)
	const [contact, setContact] = useState<Contact>(emptyContact)
	const [customerContact, setCustomerContact] = useState<Contact>(emptyContact)
	const [billing, setBilling] = useState<Address>({})
	const [shipping, setShipping] = useState<Address>({})
	const [rates, setRates] = useState<string[]>([])
	const checkoutInput = useMemo<CheckoutInput>(
		() => ({ items: draft.items.map(({ id, quantity }) => ({ id, quantity })), contact, billing, shipping, rates, coupon }),
		[draft.items, contact, billing, shipping, rates, coupon],
	)
	const latestInput = useRef(checkoutInput)
	latestInput.current = checkoutInput
	const [quote, setQuote] = useState<Quote | null>(null)
	const [reviewedInput, setReviewedInput] = useState<CheckoutInput | null>(null)
	const [sale, setSale] = useState<SaleStatus | null>(null)
	const [error, setError] = useState("")
	const [busy, setBusy] = useState(false)
	const lock = useRef(false)
	const [checkoutOpen, setCheckoutOpen] = useState(false)
	useEffect(() => {
		if (security.status.locked) {
			setScannerOpen(false)
			setCustomerOpen(false)
			setCheckoutOpen(false)
		}
	}, [security.status.locked])
	const [host, setHost] = useState<HTMLElement | null>(null)
	useEffect(() => setHost(document.querySelector<HTMLElement>(".kizlo-pos-app")), [])
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
	}, [checkoutInput])
	const review = async () => {
		if (lock.current) return
		lock.current = true
		setBusy(true)
		setError("")
		const input = checkoutInput
		try {
			const next = await quoteSale(input)
			if (latestInput.current !== input) return
			setQuote(next)
			setReviewedInput(input)
		} catch (failure) {
			if (latestInput.current !== input) return
			setError(apiProblem(failure).message)
			void configQuery.refetch()
		} finally {
			lock.current = false
			setBusy(false)
		}
	}
	const submit = async (method: "cash" | "online") => {
		if (lock.current || !quote || !reviewedInput || reviewedInput !== checkoutInput || draft.submitted) return
		lock.current = true
		setBusy(true)
		setError("")
		// Persist the recovery pointer before sending; a timeout must never make the UI create a second sale.
		setCheckoutOpen(false)
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
	const preview = useQuery({
		queryKey: ["pos", "cart-preview", checkoutInput],
		queryFn: () => quoteSale(checkoutInput),
		enabled: Boolean(config && !Object.values(config.fields).some(Boolean) && draft.items.length && !draft.submitted && !checkoutOpen),
	})
	const displayQuote = quote ?? preview.data
	const money = (amount?: string) =>
		amount !== undefined
			? formatMoney(amount, displayQuote?.currency ?? config?.currency ?? "USD", displayQuote?.decimals ?? config?.decimals ?? 2)
			: draft.items.length
				? "—"
				: formatMoney("0", config?.currency ?? "USD", config?.decimals ?? 2)
	const customerName = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.email || contact.phone
	const newSale = () => {
		reset()
		setMobileCartOpen(false)
		setSale(null)
		setQuote(null)
		setReviewedInput(null)
		setContact(emptyContact)
		setBilling({})
		setShipping({})
		setRates([])
		setCoupon("")
		setCouponInput("")
		setCouponEditing(true)
		setError("")
	}
	const itemCount = draft.items.reduce((sum, item) => sum + item.quantity, 0)
	const openCheckout = () => {
		if (!config || !draft.items.length || busy) return
		setCheckoutOpen(true)
		setQuote(null)
		setReviewedInput(null)
		if (!Object.values(config.fields).some(Boolean)) void review()
	}
	const changeQuantity = (id: number, quantity: number) => {
		if (Number.isInteger(quantity) && quantity > 0 && quantity <= 10000)
			setDraft((state) => ({ ...state, items: state.items.map((line) => (line.id === id ? { ...line, quantity } : line)) }))
	}
	return (
		<>
			<h1 className="sr-only">{browsing ? "Products" : "Point of Sale"}</h1>
			<aside
				className={cn(
					"pos-sidebar group/sidebar fixed compact:inset-x-0 inset-y-0 compact:top-auto compact:bottom-0 left-0 z-40 flex compact:h-(--pos-bottom-nav-height)",
					"compact:w-full w-18 flex-col items-center border-border compact:border-0 compact:border-border compact:border-t border-r bg-background p-3 compact:pt-2",
					"compact:pr-[max(12px,env(safe-area-inset-right))] compact:pb-[calc(8px+env(safe-area-inset-bottom))] compact:pl-[max(12px,env(safe-area-inset-left))]",
				)}
				aria-label="Point of sale controls"
				data-mobile-cart={showMobileCart}
				data-has-items={itemCount > 0}
			>
				<nav
					aria-label="POS navigation"
					className="flex compact:grid compact:h-14 compact:w-full flex-1 compact:grid-cols-5 flex-col items-center compact:gap-1 gap-3 [&_svg]:size-5.5"
				>
					<NavLink
						className={navigationLinkClassName}
						to="/sell"
						aria-label="Point of sale"
						title="Point of sale"
						onClick={() => setMobileCartOpen(false)}
					>
						<HouseIcon aria-hidden="true" />
						<span className="pos-nav-label hidden">Home</span>
					</NavLink>
					<NavLink className={navigationLinkClassName} to="/products" aria-label="Browse products" title="Browse products">
						<TagIcon size={22} aria-hidden="true" />
						<span className="pos-nav-label hidden">Products</span>
					</NavLink>
					<Button
						type="button"
						variant="outline"
						className={cn(
							navigationItemClassName,
							"pos-sidebar-scan hidden! compact:flex! compact:size-14! compact:justify-self-center compact:rounded-full! compact:bg-transparent! compact:text-foreground! compact:hover:bg-transparent compact:hover:text-foreground",
						)}
						aria-label="Scan barcode"
						title="Scan barcode"
						disabled={draft.submitted}
						onClick={() => setScannerOpen(true)}
					>
						<ScanIcon size={22} aria-hidden="true" />
					</Button>
					<button className={navigationItemClassName} type="button" aria-label="Recent sales" title="Recent sales" disabled>
						<ClockCounterClockwiseIcon aria-hidden="true" />
						<span className="pos-nav-label hidden">Sales</span>
					</button>
					{/* Avoid overlapping modal click blockers when the account menu opens the lock screen. */}
					<DropdownMenu modal={false}>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								className={cn(
									"pos-staff-account group/account relative compact:m-0 mt-auto compact:flex grid size-12 compact:h-14 compact:w-full shrink-0 cursor-pointer compact:flex-col",
									"place-items-center compact:items-center compact:justify-center compact:gap-1 compact:rounded-[10px] rounded-[10px] border-0 bg-transparent",
									"compact:bg-transparent compact:p-1 p-0 compact:text-muted-foreground text-foreground focus-visible:bg-transparent focus-visible:text-primary",
									"focus-visible:shadow-none focus-visible:outline-none!",
								)}
								aria-label={`User menu for ${userName}`}
								title={userName}
							>
								<span className="pos-staff-avatar grid mobile:size-7 size-9 shrink-0 place-items-center rounded-full bg-accent text-muted-foreground group-focus-visible/account:text-primary group-[&]/sidebar:compact:size-5.5 group-[&]/sidebar:compact:bg-transparent mobile:[&_svg]:size-4.5 group-[&]/sidebar:compact:[&_svg]:size-5.5">
									<UserIcon size={22} aria-hidden="true" />
								</span>
								<span className="pos-nav-label hidden">Account</span>
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent
							container={host}
							side="top"
							align="end"
							sideOffset={12}
							className={cn(
								"pos-account-actions w-[238px] rounded-lg border border-border bg-background p-2 shadow-[0_6px_24px_rgb(0_0_0/8%)] [&_[data-highlighted]]:bg-accent",
								"[&_[data-highlighted]]:outline-none [&_[role=menuitem]]:flex [&_[role=menuitem]]:min-h-11 [&_[role=menuitem]]:w-full [&_[role=menuitem]]:items-center",
								"[&_[role=menuitem]]:justify-start [&_[role=menuitem]]:px-3 [&_[role=menuitem]]:py-2.5 [&_[role=menuitem]]:text-[13px]",
							)}
							aria-label="User menu"
						>
							<DropdownMenuItem asChild>
								<NavLink to="/settings">User settings</NavLink>
							</DropdownMenuItem>
							<DropdownMenuItem disabled={!security.status.configured} onSelect={() => void security.lock()}>
								Lock screen
							</DropdownMenuItem>
							<DropdownMenuItem onSelect={() => void client.resetQueries({ queryKey: ["pos", "products"] })}>
								<ArrowClockwiseIcon size={22} aria-hidden="true" />
								Refresh catalog
							</DropdownMenuItem>
							<DropdownMenuItem
								className="pos-theme-button"
								onSelect={onToggleTheme}
								aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
							>
								{theme === "light" ? <MoonIcon size={22} aria-hidden="true" /> : <SunIcon size={22} aria-hidden="true" />}
								{theme === "light" ? "Dark" : "Light"} theme
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</nav>
			</aside>
			{settingsPage ? (
				<UserSettings accountUrl={accountUrl} />
			) : (
				<section
					className="pos-sell group/sell grid flex-1 grid-cols-[minmax(0,1fr)_clamp(320px,24.1vw,494px)] mobile:grid-cols-[minmax(0,1fr)] tablet:grid-cols-[minmax(0,1fr)_320px] items-start gap-5.5 mobile:gap-0 tablet:gap-4.5 wide:gap-7 data-[view=products]:grid-cols-[minmax(0,1fr)]"
					aria-label={browsing ? "Browse products" : "Point of sale"}
					data-view={browsing ? "products" : "sell"}
					data-mobile-cart={showMobileCart}
					data-has-items={itemCount > 0}
				>
					<div
						className="pos-sell-catalog min-w-0 mobile:group-data-[mobile-cart=true]/sell:invisible"
						inert={draft.submitted && !browsing}
					>
						<Products
							browseOnly={browsing}
							onSelect={add}
							scannerOpen={scannerOpen}
							onScannerOpenChange={setScannerOpen}
							loginUrl={loginUrl}
						/>
					</div>
					<section
						id="pos-sale-cart"
						className={cn(
							"pos-sale-cart group-data-[view=products]/sell:hidden! flex mobile:hidden min-h-0 min-w-0 flex-col overflow-hidden border-border border-l bg-background",
							"desktop:sticky desktop:top-0 compact:desktop:-mt-[calc(16px+env(safe-area-inset-top))] desktop:-mt-4 desktop:-mr-4 desktop:-mb-4 compact:desktop:h-[calc(100dvh-var(--pos-bottom-nav-height))] desktop:h-dvh",
							"mobile:group-data-[mobile-cart=true]/sell:fixed mobile:group-data-[mobile-cart=true]/sell:inset-0",
							"mobile:group-data-[mobile-cart=true]/sell:bottom-(--pos-bottom-nav-height) mobile:group-data-[mobile-cart=true]/sell:z-30",
							"mobile:group-data-[mobile-cart=true]/sell:flex mobile:group-data-[mobile-cart=true]/sell:overflow-y-auto",
							"mobile:group-data-[mobile-cart=true]/sell:overscroll-contain mobile:group-data-[mobile-cart=true]/sell:rounded-none",
							"mobile:group-data-[mobile-cart=true]/sell:border-0 mobile:group-data-[mobile-cart=true]/sell:bg-canvas",
							"mobile:group-data-[mobile-cart=true]/sell:pt-[calc(var(--pos-cart-header-height)+12px)] mobile:group-data-[mobile-cart=true]/sell:pb-0",
							"mobile:group-data-[mobile-cart=true]/sell:[--pos-cart-header-height:calc(68px+env(safe-area-inset-top))] [&>a]:underline",
						)}
						aria-label="Current sale"
					>
						<div className="pos-cart-heading mobile:fixed mobile:inset-x-0 mobile:top-0 mobile:z-1 flex mobile:h-(--pos-cart-header-height) shrink-0 items-center gap-2 mobile:bg-canvas mobile:px-4 px-4 wide:px-5 mobile:pt-[env(safe-area-inset-top)] pt-4 wide:pt-5 mobile:pb-0 pb-4.5 wide:pb-6 [&_h2:focus]:outline-none!">
							{!draft.submitted && (
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="pos-cart-back mobile:inline-flex hidden mobile:shrink-0 p-0 text-foreground [&_svg]:size-6"
									aria-label="Back to products"
									onClick={() => setMobileCartOpen(false)}
								>
									<CaretLeftIcon aria-hidden="true" />
								</Button>
							)}
							<h2
								className="font-medium mobile:text-[26px] text-[clamp(20px,1.3vw,27px)] tracking-[-0.5px]"
								ref={cartHeading}
								tabIndex={-1}
							>
								Cart
							</h2>
						</div>
						<div
							className={cn(
								"pos-customer-card mx-4 wide:mx-5 mb-3.5 mobile:mb-4 wide:mb-5.5 flex min-h-16 wide:min-h-20 shrink-0 mobile:rounded-lg rounded-sm border border-border",
								"mobile:bg-background mobile:p-3 wide:p-3.5 px-3 py-2.5 [&>button:last-child:not(:first-child)]:h-9 [&>button:last-child:not(:first-child)]:w-6.5",
								"[&>button:last-child:not(:first-child)]:p-0 [&>button:last-child:not(:first-child)_svg]:size-5.5",
							)}
						>
							<button
								className="pos-customer-summary flex min-w-0 flex-1 items-center gap-3 mobile:gap-2 bg-transparent p-0 text-left text-foreground [line-height:normal] [&>span:last-child]:min-w-0"
								type="button"
								disabled={draft.submitted || !config}
								onClick={() => {
									setCustomerContact(contact)
									setCustomerOpen(true)
								}}
							>
								<span className="pos-staff-avatar grid mobile:size-7 size-9 shrink-0 place-items-center rounded-full bg-accent text-muted-foreground group-focus-visible/account:text-primary group-[&]/sidebar:compact:size-5.5 group-[&]/sidebar:compact:bg-transparent mobile:[&_svg]:size-4.5 group-[&]/sidebar:compact:[&_svg]:size-5.5">
									<UserIcon size={22} aria-hidden="true" />
								</span>
								<span>
									<strong className="block truncate font-medium mobile:text-[15px] text-[14px] wide:text-[18px]">
										{customerName || "Walk-in customer"}
									</strong>
									<small className="mt-0.75 block truncate mobile:text-[12px] text-[12px] text-muted-foreground wide:text-[15px]">
										{customerName ? contact.email || contact.phone || "Customer details" : "Add customer details"}
									</small>
								</span>
							</button>
							{customerName && !draft.submitted && (
								<Button
									type="button"
									variant="ghost"
									aria-label="Remove customer"
									onClick={() => {
										setContact(emptyContact)
										setBilling({})
										setShipping({})
										setRates([])
									}}
								>
									<XIcon aria-hidden="true" />
								</Button>
							)}
						</div>
						<div className="pos-cart-selection flex min-h-9.5 mobile:min-h-11 shrink-0 items-center justify-between px-4 wide:px-5 mobile:pt-0 pt-1 wide:pt-1.5 pb-3 wide:pb-4 mobile:text-[15px] text-sm/normal wide:text-lg/normal [&_button]:h-6 mobile:[&_button]:min-h-11 [&_button]:bg-transparent [&_button]:py-0 [&_button]:pr-0 [&_button]:pl-3 [&_button]:text-[#a61b1b]">
							<span>
								{itemCount} {itemCount === 1 ? "Item" : "Items"} Selected
							</span>
							{!draft.submitted && draft.items.length > 0 && (
								<Button type="button" variant="ghost" className="hover:bg-transparent" onClick={newSale}>
									Clear
								</Button>
							)}
						</div>
						<div className="pos-cart-body [&>a]:underline! min-h-0 flex-1 mobile:flex-none mobile:overflow-visible overflow-y-auto overscroll-contain mobile:px-4 px-4 wide:px-5 pt-0 mobile:pb-4 pb-4 wide:pb-5 [&>a]:my-3 [&>a]:block [&>button]:my-3 [&>h3]:font-bold [&>h3]:text-[1.17em] [&>p]:my-3">
							{error && (
								<p
									role="alert"
									className="pos-error [&_a]:underline! my-3 rounded-lg border border-[#e99] bg-background p-3 text-[13px] text-foreground [&_a]:inline-block [&_a]:p-2"
								>
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
										{sale.needs_payment && config && <PaymentHandoff sale={sale} config={config} refresh={refresh} />}
										<a href={sale.admin_url} target="_blank" rel="noreferrer">
											Review order in WooCommerce
										</a>
										<Button type="button" onClick={newSale}>
											{sale.paid ? "Next sale" : "Keep this order and start next sale"}
										</Button>
									</>
								) : busy ? (
									<p role="status">Saving sale…</p>
								) : (
									<>
										<p>The submission outcome needs checking. Do not collect payment again.</p>
										<Button type="button" onClick={() => void refresh()}>
											Recover sale status
										</Button>
									</>
								)
							) : (
								<>
									{!draft.items.length && (
										<div className="pos-cart-empty flex h-full min-h-25 mobile:min-h-45 flex-col items-center justify-center gap-2.5 mobile:rounded-lg mobile:border mobile:border-border mobile:bg-background text-center text-muted-foreground [&>svg]:mb-1 [&>svg]:size-7.5 [&_h3]:font-medium [&_h3]:text-[15px] [&_h3]:text-foreground [&_p]:text-[13px]">
											<CubeIcon size={22} aria-hidden="true" />
											<h3>Your cart is empty</h3>
											<p>Tap a product or scan a barcode.</p>
										</div>
									)}
									{draft.items.map((item) => (
										<SaleLine
											key={item.id}
											item={item}
											onQuantity={(quantity) => changeQuantity(item.id, quantity)}
											onRemove={() => setDraft((state) => ({ ...state, items: state.items.filter((line) => line.id !== item.id) }))}
										/>
									))}
								</>
							)}
						</div>
						{!draft.submitted && (
							<div className="pos-cart-footer mobile:mt-auto grid shrink-0 gap-3.5 mobile:gap-4.5 wide:gap-5 border-border border-t mobile:border-t-0 mobile:p-4 p-4 wide:p-5 [&>p]:text-[13px] [&>p]:text-muted-foreground">
								{!config &&
									(configQuery.error ? (
										<p role="status">{apiProblem(configQuery.error).message}</p>
									) : (
										<Spinner className="mx-auto my-3 text-muted-foreground" aria-label="Loading checkout" />
									))}
								{configQuery.error && (
									<Button type="button" variant="outline" onClick={() => void configQuery.refetch()}>
										Retry checkout
									</Button>
								)}
								<form
									className={cn(
										"pos-discount mobile:rounded-lg mobile:border mobile:border-border mobile:bg-background mobile:p-4 [&>div:focus-within]:border-muted-foreground",
										"[&>div>svg]:size-4.5 [&>div>svg]:shrink-0 [&>div]:flex [&>div]:items-center [&>div]:gap-1.5 [&>div]:rounded-sm [&>div]:border [&>div]:border-border",
										"mobile:[&>div]:p-2.5 [&>div]:px-2.5 wide:[&>div]:px-3 [&>div]:py-1.5 wide:[&>div]:py-3.5 [&>label]:mb-2 [&>label]:block [&>label]:text-muted-foreground",
										"[&>label]:text-sm/normal wide:[&>label]:text-lg/normal [&_button]:h-6.5 [&_button]:rounded-[3px] [&_button]:px-2 [&_button]:py-0.5 [&_button]:font-normal",
										"[&_button]:text-xs/normal [&_button]:shadow-none [&_input]:h-6.5 [&_input]:min-w-0 [&_input]:flex-1 [&_input]:border-0 [&_input]:p-0 [&_input]:text-[13px]",
										"wide:[&_input]:text-[17px] [&_input]:shadow-none",
									)}
									onSubmit={(event) => {
										event.preventDefault()
										setCoupon(couponInput.trim())
										setCouponEditing(false)
									}}
								>
									<label htmlFor="pos-discount-code">Discount Code</label>
									<div>
										<SealPercentIcon size={22} aria-hidden="true" />
										<Input
											id="pos-discount-code"
											placeholder="Enter discount code"
											value={couponInput}
											readOnly={!couponEditing}
											maxLength={100}
											disabled={config?.coupons_enabled === false || !draft.items.length}
											onChange={(event) => setCouponInput(event.target.value)}
										/>
										{couponEditing ? (
											<Button
												type="submit"
												variant="outline"
												disabled={!draft.items.length || !couponInput.trim() || config?.coupons_enabled === false}
											>
												Apply
											</Button>
										) : (
											<>
												<Button type="button" variant="outline" onClick={() => setCouponEditing(true)}>
													Change
												</Button>
												<Button
													type="button"
													variant="ghost"
													aria-label="Remove discount code"
													onClick={() => {
														setCoupon("")
														setCouponInput("")
														setCouponEditing(true)
													}}
												>
													<XIcon aria-hidden="true" />
												</Button>
											</>
										)}
									</div>
								</form>
								{preview.error && (
									<p
										role="alert"
										className="pos-error [&_a]:underline! my-3 rounded-lg border border-[#e99] bg-background p-3 text-[13px] text-foreground [&_a]:inline-block [&_a]:p-2"
									>
										{apiProblem(preview.error).message}
									</p>
								)}
								<div
									className="pos-cart-totals mobile:rounded-lg rounded-sm border border-border mobile:bg-background mobile:p-3 wide:p-3.5 px-3 py-2.5 text-muted-foreground [&>p>span:last-child]:text-foreground"
									aria-busy={preview.isFetching}
								>
									<p className="flex justify-between gap-3 mobile:py-1.75 py-1.25 wide:py-1.5 mobile:text-sm/normal text-[clamp(13px,0.95vw,19px)]">
										<span>Total Product Price</span>
										<span>{money(displayQuote?.subtotal)}</span>
									</p>
									<p className="flex justify-between gap-3 mobile:py-1.75 py-1.25 wide:py-1.5 mobile:text-sm/normal text-[clamp(13px,0.95vw,19px)]">
										<span>Value Added Tax</span>
										<span>{money(displayQuote?.tax)}</span>
									</p>
									{displayQuote?.shipping_ex_tax && Number(displayQuote.shipping_ex_tax) > 0 && (
										<p className="flex justify-between gap-3 mobile:py-1.75 py-1.25 wide:py-1.5 mobile:text-sm/normal text-[clamp(13px,0.95vw,19px)]">
											<span>Shipping</span>
											<span>{money(displayQuote.shipping_ex_tax)}</span>
										</p>
									)}
									<p className="flex justify-between gap-3 mobile:py-1.75 py-1.25 wide:py-1.5 mobile:text-sm/normal text-[clamp(13px,0.95vw,19px)]">
										<span>Discount</span>
										<span>
											{displayQuote?.discount && Number(displayQuote.discount) > 0 ? "−" : ""}
											{money(displayQuote?.discount)}
										</span>
									</p>
									<p className="pos-cart-total mt-3 flex justify-between gap-3 border-[#d4d4d4] border-t border-dashed mobile:py-1.75 py-1.25 wide:py-1.5 mobile:pt-4 pt-3.5 mobile:text-lg/normal text-[clamp(15px,1.05vw,21px)] text-foreground [&_strong]:font-semibold">
										<span>Total Payment</span>
										<strong>{money(displayQuote?.total)}</strong>
									</p>
								</div>
								<Button
									className="min-h-11.5 mobile:min-h-13 wide:min-h-15 w-full rounded-sm border border-[#0874cf] bg-[linear-gradient(#137acb,#0071d3)] font-medium mobile:text-[17px] text-base/normal text-white wide:text-xl/normal [text-shadow:0_1px_1px_rgb(0_0_0/15%)]"
									type="button"
									disabled={!config || busy || !draft.items.length}
									onClick={openCheckout}
								>
									Proceed to Payment
								</Button>
							</div>
						)}
					</section>
					{itemCount > 0 && (
						<div
							className={cn(
								"pos-mobile-actions group-data-[view=products]/sell:hidden! mobile:group-data-[mobile-cart=true]/sell:hidden! mobile:pointer-events-none mobile:fixed",
								"mobile:inset-x-0 mobile:bottom-(--pos-bottom-nav-height) mobile:z-20 mobile:flex hidden mobile:flex-col mobile:items-center mobile:gap-3 mobile:bg-linear-to-b",
								"mobile:from-transparent mobile:to-canvas mobile:px-4 mobile:py-3 mobile:[&_button]:pointer-events-auto mobile:[&_button]:bg-primary mobile:[&_button]:text-white",
								"mobile:[&_button]:shadow-[0_4px_16px_rgb(0_0_0/18%)]",
							)}
						>
							<Button
								ref={continueButton}
								type="button"
								className={cn(
									"pos-mobile-continue mobile:grid! mobile:min-h-13 mobile:w-full mobile:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] mobile:items-center mobile:rounded-[10px]",
									"mobile:border mobile:border-[#bfd8ef] mobile:bg-[#e8f2fc]! mobile:text-[#164b7c]! mobile:text-base/normal mobile:shadow-[0_2px_8px_rgb(0_0_0/8%)]!",
									"mobile:[&_svg]:size-5 mobile:[&_svg]:justify-self-end",
								)}
								aria-controls="pos-sale-cart"
								onClick={() => setMobileCartOpen(true)}
							>
								<span className="pos-mobile-item-count mobile:justify-self-start mobile:font-normal mobile:text-[13px]">
									{itemCount} {itemCount === 1 ? "item" : "items"}
								</span>
								<span>Continue</span>
								<ArrowRightIcon aria-hidden="true" />
							</Button>
						</div>
					)}
					<Dialog open={customerOpen && !draft.submitted} onOpenChange={setCustomerOpen}>
						<DialogContent
							container={host}
							className="pos-checkout-dialog pos-customer-dialog p-0! [&_p]:text-[13px] [&_select]:min-h-10.5 [&_select]:w-full [&_select]:rounded-md [&_select]:border [&_select]:border-border [&_select]:bg-background [&_select]:p-2 [&_select]:text-foreground"
						>
							<header className="pos-customer-dialog-header border-border border-b px-7 py-6">
								<DialogTitle className="pr-10 font-medium text-lg/normal">Customer details</DialogTitle>
								<DialogDescription className="sr-only">Add the customer details for this sale.</DialogDescription>
							</header>
							<form
								className="m-0 grid gap-0"
								onSubmit={(event) => {
									event.preventDefault()
									setContact(customerContact)
									setCustomerOpen(false)
								}}
							>
								<div className="pos-customer-dialog-fields grid gap-6 p-7">
									{(Object.keys(emptyContact) as (keyof Contact)[]).map((field) => (
										<label className="grid gap-1.5 text-[13px]" key={field} htmlFor={`pos-customer-${field}`}>
											{field.charAt(0).toUpperCase() + field.slice(1).replace("_", " ")}
											<Input
												className="min-h-10.5 w-full"
												id={`pos-customer-${field}`}
												type={field === "email" ? "email" : field === "phone" ? "tel" : "text"}
												value={customerContact[field]}
												maxLength={200}
												required={config?.fields[field]}
												onChange={(event) => setCustomerContact({ ...customerContact, [field]: event.target.value })}
											/>
										</label>
									))}
								</div>
								<footer className="pos-customer-dialog-actions flex justify-end gap-3 border-border border-t px-7 py-5">
									<Button type="button" variant="outline" onClick={() => setCustomerOpen(false)}>
										Cancel
									</Button>
									<Button type="submit">Save customer</Button>
								</footer>
							</form>
						</DialogContent>
					</Dialog>
					<Dialog open={checkoutOpen && !draft.submitted} onOpenChange={setCheckoutOpen}>
						<DialogContent container={host} className="pos-checkout-dialog">
							<DialogTitle>Checkout</DialogTitle>
							<DialogDescription>Review customer details and the total before collecting payment.</DialogDescription>
							{error && (
								<p
									role="alert"
									className="pos-error [&_a]:underline! my-3 rounded-lg border border-[#e99] bg-background p-3 text-[13px] text-foreground [&_a]:inline-block [&_a]:p-2"
								>
									{error}
								</p>
							)}
							{config && (
								<form
									className="mt-5 grid gap-3.5"
									onSubmit={(event) => {
										event.preventDefault()
										void review()
									}}
								>
									{(Object.keys(emptyContact) as (keyof Contact)[])
										.filter((field) => config.fields[field])
										.map((field) => (
											<label className="grid gap-1.5 text-[13px]" key={field} htmlFor={`pos-contact-${field}`}>
												{field.charAt(0).toUpperCase() + field.slice(1).replace("_", " ")}
												<Input
													className="min-h-10.5 w-full"
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
										<p className="text-[13px]">
											Shipping destination defaults to the store address. Shipping charges and tax are calculated at review.
										</p>
									)}
									<Button type="submit" disabled={busy || !draft.items.length}>
										Review total
									</Button>
									{rates.length > 0 && (
										<Button type="button" variant="outline" onClick={() => setRates([])}>
											Reset shipping choice
										</Button>
									)}
									{quote && (
										<section
											className="pos-sale-review grid gap-3.5 border-border border-t pt-4.5 [&>p]:flex [&>p]:justify-between [&>p]:gap-3"
											aria-label="Sale review"
										>
											{quote.items.map((item) => (
												<p className="text-[13px]" key={item.id}>
													{item.name} × {item.quantity} <strong>{formatMoney(item.total, quote.currency, quote.decimals)}</strong>
												</p>
											))}
											{quote.rates.map((packageRates, index) => (
												<label
													className="grid gap-1.5 text-[13px]"
													key={packageRates[0]?.id ?? index}
													htmlFor={`pos-shipping-rate-${index}`}
												>
													Shipping option
													<select
														className="min-h-10.5 w-full rounded-md border border-border bg-background p-2 text-foreground"
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
											<p className="text-[13px]">Shipping: {formatMoney(quote.shipping_total, quote.currency, quote.decimals)}</p>
											<p className="text-[13px]">Tax included in total: {formatMoney(quote.tax, quote.currency, quote.decimals)}</p>
											<p className="pos-sale-total font-semibold text-[13px] text-xl!">
												Total: {formatMoney(quote.total, quote.currency, quote.decimals)}
											</p>
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
											{!quote.cash && <p className="text-[13px]">Cash is unavailable. Check the store’s COD configuration.</p>}
											{!quote.online.length && <p className="text-[13px]">No online gateway is available for this sale.</p>}
										</section>
									)}
								</form>
							)}
						</DialogContent>
					</Dialog>
				</section>
			)}
		</>
	)
}

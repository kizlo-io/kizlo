import { CubeIcon, GridFourIcon, ListDashesIcon, MagnifyingGlassIcon } from "@phosphor-icons/react"
import { useInfiniteQuery } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { apiProblem } from "./api"
import { BarcodeCamera } from "./BarcodeCamera"
import { ProductDialog } from "./ProductDialog"
import { getProducts, mergeProducts, type ProductCard } from "./products-api"
import { useSaleCart } from "./sale-cart"

export function ProductImage({ product, className }: { product: ProductCard; className?: string }) {
	const [failed, setFailed] = useState(false)
	useEffect(() => setFailed(false), [product.image?.url])
	return (
		<div
			className={cn(
				"pos-product-image grid shrink-0 place-items-center overflow-hidden bg-[#e9e9e9] dark:bg-accent [&>span]:text-muted-foreground [&>span]:opacity-40 [&_img]:size-full [&_img]:object-contain [&_img]:p-3 [&_span>svg]:size-11",
				className,
			)}
		>
			{product.image?.url && !failed ? (
				<img src={product.image.url} alt={product.image.alt || product.name} loading="lazy" onError={() => setFailed(true)} />
			) : (
				<span>
					<CubeIcon size={22} aria-hidden="true" />
					<span className="sr-only">No image</span>
				</span>
			)}
		</div>
	)
}

export function Products({
	scannerOpen,
	onScannerOpenChange,
	loginUrl,
	onSelect,
	browseOnly = false,
}: {
	scannerOpen: boolean
	onScannerOpenChange: (open: boolean) => void
	loginUrl: string
	onSelect?: (product: ProductCard) => void
	browseOnly?: boolean
}) {
	const [input, setInput] = useState("")
	const [search, setSearch] = useState("")
	const [layout, setLayout] = useState<"cards" | "list">(() => {
		try {
			return localStorage.getItem("kizlo-pos:product-layout") === "list" ? "list" : "cards"
		} catch {
			return "cards"
		}
	})
	useEffect(() => {
		try {
			localStorage.setItem("kizlo-pos:product-layout", layout)
		} catch {
			// Layout switching still works when browser storage is unavailable.
		}
	}, [layout])
	const openingCard = useRef<HTMLElement | null>(null)
	const { addScanned } = useSaleCart()
	const [dialog, setDialog] = useState<{ id: number; mode: "options" | "share"; variation?: number; open: boolean } | null>(null)
	const [message, setMessage] = useState("")
	const [addError, setAddError] = useState("")
	const settling = input.trim() !== search
	const catalog = useInfiniteQuery({
		queryKey: ["pos", "products", search],
		queryFn: ({ pageParam, signal }) => getProducts(search, pageParam, signal),
		initialPageParam: 1,
		getNextPageParam: (last) => (last.has_more ? last.page + 1 : undefined),
		enabled: !settling,
	})
	const items = settling ? [] : mergeProducts([], catalog.data?.pages.flatMap((page) => page.items) ?? [])
	const total = catalog.data?.pages.at(-1)?.total ?? 0
	const loading = settling || catalog.isFetching || catalog.isPending
	const error = !settling && catalog.error ? apiProblem(catalog.error).message : ""
	const more = () => {
		if (!catalog.isFetching && !settling) void catalog.fetchNextPage()
	}
	useEffect(() => {
		const timeout = setTimeout(() => setSearch(input.trim()), input ? 300 : 0)
		return () => clearTimeout(timeout)
	}, [input])
	const close = () => setDialog((current) => (current ? { ...current, open: false } : null))
	const afterClose = () => {
		setDialog(null)
		openingCard.current?.focus()
	}
	const add = (product: ProductCard) => {
		setAddError("")
		onSelect?.(product)
		setMessage(`Added ${product.name}`)
	}
	const openProduct = (product: ProductCard, mode: "options" | "share", trigger: HTMLElement) => {
		openingCard.current = trigger
		setDialog({
			open: true,
			id: product.id,
			mode,
			variation: product.matched_variations?.length === 1 ? product.matched_variations[0] : undefined,
		})
	}
	const scan = async (code: string) => {
		const item = await addScanned(code)
		return `Added ${item.name} · quantity ${item.quantity}`
	}
	return (
		<section className="pos-catalog flex flex-col mobile:pt-13.5" aria-label="Product catalog">
			<div className="pos-catalog-tools mobile:fixed sticky mobile:inset-x-0 top-0 z-20 compact:desktop:-mt-[calc(16px+env(safe-area-inset-top))] desktop:-mt-4 flex shrink-0 items-center gap-2.5 wide:gap-3.5 bg-canvas mobile:px-3 compact:desktop:pt-[calc(16px+env(safe-area-inset-top))] desktop:pt-4 mobile:pt-[calc(12px+env(safe-area-inset-top))] mobile:pb-3 pb-3.5 wide:pb-7">
				<label
					className="pos-search relative min-w-0 flex-1 [&>svg]:absolute [&>svg]:top-2.5 wide:[&>svg]:top-3.25 [&>svg]:left-2.75 [&>svg]:size-5 [&>svg]:text-foreground"
					htmlFor="pos-product-search"
				>
					<span className="sr-only">Search products</span>
					<MagnifyingGlassIcon size={22} aria-hidden="true" />
					<Input
						className="h-10 wide:h-11.5 rounded-sm border-border bg-background pl-9.5 text-sm/normal wide:text-lg/normal shadow-none"
						id="pos-product-search"
						type="search"
						value={input}
						maxLength={200}
						placeholder="Search products, SKU, barcode…"
						autoComplete="off"
						onChange={(event) => setInput(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault()
								setSearch(input.trim())
							}
						}}
					/>
				</label>
				<Button
					type="button"
					variant="outline"
					size="icon"
					className="pos-layout-toggle size-10 wide:size-11.5 shrink-0 rounded-sm border-border bg-background text-foreground shadow-none [&_svg]:size-5"
					aria-label={layout === "cards" ? "Switch to list view" : "Switch to card view"}
					title={layout === "cards" ? "Switch to list view" : "Switch to card view"}
					onClick={() => setLayout(layout === "cards" ? "list" : "cards")}
				>
					{layout === "cards" ? <ListDashesIcon aria-hidden="true" /> : <GridFourIcon aria-hidden="true" />}
				</Button>
			</div>
			<BarcodeCamera open={scannerOpen} onOpenChange={onScannerOpenChange} onScan={scan} />
			{addError && (
				<p
					role="alert"
					className="pos-error [&_a]:underline! my-3 rounded-lg border border-[#e99] bg-background p-3 text-[13px] text-foreground [&_a]:inline-block [&_a]:p-2"
				>
					{addError}
				</p>
			)}
			{message && (
				<p className="sr-only" role="status">
					{message}
				</p>
			)}
			{!loading && (
				<p className="sr-only" role="status">
					{error && !catalog.data ? "Products unavailable" : `${items.length} of ${total} products`}
				</p>
			)}
			<div className="pos-catalog-results pt-0 pr-0.75 pb-0.75 pl-0 mobile:group-data-[has-items=true]/sell:pb-22">
				{loading && !error && items.length === 0 && (
					<div className="flex min-h-40 items-center justify-center text-muted-foreground">
						<Spinner aria-label="Loading products" />
					</div>
				)}
				{error && (
					<div
						className="pos-error [&_a]:underline! my-3 rounded-lg border border-[#e99] bg-background p-3 text-[13px] text-foreground [&_a]:inline-block [&_a]:p-2"
						role="alert"
					>
						<p>{error}</p>
						<Button type="button" onClick={catalog.isFetchNextPageError ? more : () => void catalog.refetch()}>
							Try again
						</Button>
					</div>
				)}
				{!loading && !error && items.length === 0 && (
					<div className="pos-catalog-empty flex min-h-55 flex-col items-center justify-center gap-2.5 p-6 text-center text-muted-foreground [&_h3]:font-medium [&_h3]:text-[15px] [&_h3]:text-foreground [&_p]:text-[13px]">
						<CubeIcon size={22} aria-hidden="true" />
						<h3>{search ? "No products found" : "Your catalog is empty"}</h3>
						<p>{search ? "Try another name, SKU or barcode." : "Published WooCommerce products will appear here."}</p>
					</div>
				)}
				<div
					className="pos-product-grid group/layout grid grid-cols-4 mobile:grid-cols-2 tablet:grid-cols-2 items-stretch gap-4.5 mobile:gap-2.5 tablet:gap-3.5 wide:gap-6.5 data-[layout=list]:grid-cols-[minmax(0,1fr)] data-[layout=list]:gap-2.5"
					data-layout={layout}
					aria-busy={loading}
				>
					{items.map((product) => (
						<article
							className="pos-product-card relative min-w-0 overflow-hidden rounded-lg border border-border bg-background hover:border-[color-mix(in_srgb,var(--pos-blue)_45%,var(--pos-line))]"
							key={product.id}
						>
							<button
								type="button"
								className={cn(
									"pos-product-add flex h-full w-full flex-col bg-transparent p-0 text-left text-inherit focus-visible:-outline-offset-3 disabled:cursor-default",
									"disabled:opacity-50 group-data-[layout=list]/layout:flex-row group-data-[layout=list]/layout:items-center group-data-[layout=list]/layout:gap-4",
									"mobile:group-data-[layout=list]/layout:gap-3 group-data-[layout=list]/layout:p-3 mobile:group-data-[layout=list]/layout:p-2.5",
								)}
								aria-label={`${browseOnly ? "View" : product.type === "variable" ? "Choose options for" : "Add"} ${product.name}`}
								disabled={
									!browseOnly &&
									(product.stock === "outofstock" || product.price === null || !["simple", "variation", "variable"].includes(product.type))
								}
								onClick={(event) => {
									if (browseOnly || product.type === "variable") openProduct(product, browseOnly ? "share" : "options", event.currentTarget)
									else {
										try {
											add(product)
										} catch (failure) {
											setAddError(apiProblem(failure).message)
										}
									}
								}}
							>
								<ProductImage
									product={product}
									className="aspect-[1.3] h-auto w-full group-data-[layout=list]/layout:aspect-square group-data-[layout=list]/layout:size-18 mobile:group-data-[layout=list]/layout:size-14 group-data-[layout=list]/layout:rounded-md [&_img]:object-cover [&_img]:p-0"
								/>
								<div className="pos-product-info w-full min-w-0 flex-1 mobile:p-2.5 p-3.5 wide:p-4.5 group-data-[layout=list]/layout:flex group-data-[layout=list]/layout:items-center group-data-[layout=list]/layout:gap-4 mobile:group-data-[layout=list]/layout:gap-3 group-data-[layout=list]/layout:p-0">
									<div className="min-w-0 group-data-[layout=list]/layout:flex-1">
										<h3 className="wrap-anywhere line-clamp-2 min-h-[2.8em] font-medium mobile:text-sm/[1.4] text-[15px]/[1.4] group-data-[layout=list]/layout:min-h-0">
											{product.name}
										</h3>
										{product.stock_quantity != null && (
											<span className="pos-product-stock mt-1.5 block text-muted-foreground text-xs/[1.4]">
												Stock: {product.stock_quantity}
											</span>
										)}
									</div>
									<div
										className={cn(
											"pos-product-meta group-data-[layout=list]/layout:wrap-anywhere mobile:mt-2.5 mt-3 flex mobile:flex-col flex-wrap mobile:items-start items-center justify-between",
											"gap-2 mobile:gap-1.5 group-data-[layout=list]/layout:m-0 group-data-[layout=list]/layout:max-w-[48%] group-data-[layout=list]/layout:flex-col",
											"group-data-[layout=list]/layout:items-end group-data-[layout=list]/layout:gap-1",
										)}
									>
										<span className="pos-product-price font-semibold mobile:text-[17px]/[1.4] text-lg/[1.4]">
											{product.price ?? "Price not set"}
										</span>
									</div>
								</div>
							</button>
						</article>
					))}
				</div>
				{catalog.hasNextPage && (
					<Button
						variant="outline"
						className="pos-load-more mx-auto mt-5 block"
						type="button"
						disabled={loading || input.trim() !== search}
						onClick={more}
					>
						{loading ? "Loading…" : "Load more"}
					</Button>
				)}
			</div>
			{dialog && (
				<ProductDialog
					key={`${dialog.id}:${dialog.mode}`}
					id={dialog.id}
					open={dialog.open}
					mode={dialog.mode}
					initialVariation={dialog.variation}
					onClose={close}
					onAfterClose={afterClose}
					loginUrl={loginUrl}
					onSelect={add}
				/>
			)}
		</section>
	)
}

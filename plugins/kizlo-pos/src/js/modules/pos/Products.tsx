import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { Link, useLocation, useMatch, useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { apiProblem } from "./api"
import { lookupBarcode } from "./checkout-api"
import { Icon } from "./Icon"
import { ProductDetails } from "./ProductDetails"
import { getProduct, getProducts, mergeProducts, type ProductCard, stockLabel } from "./products-api"
import { ScanInput } from "./ScanInput"
import { useSaleCart } from "./sale-cart"

export function ProductImage({ product }: { product: ProductCard }) {
	const [failed, setFailed] = useState(false)
	useEffect(() => setFailed(false), [product.image?.url])
	return (
		<div className="pos-product-image">
			{product.image?.url && !failed ? (
				<img src={product.image.url} alt={product.image.alt || product.name} loading="lazy" onError={() => setFailed(true)} />
			) : (
				<span>
					<Icon name="products" />
					<span>No image</span>
				</span>
			)}
		</div>
	)
}

export function Products({
	theme,
	onToggleTheme,
	loginUrl,
	selling = false,
	onSelect,
}: {
	theme: string
	onToggleTheme: () => void
	loginUrl: string
	selling?: boolean
	onSelect?: (product: ProductCard) => void
}) {
	const [input, setInput] = useState("")
	const [search, setSearch] = useState("")
	const openingCard = useRef<HTMLElement | null>(null)
	const { addScanned } = useSaleCart()
	const navigate = useNavigate()
	const location = useLocation()
	const base = selling ? "/sell" : "/products"
	const match = useMatch(`${base}/:id`)
	const id = Number(match?.params.id)
	const detailOpen = Boolean(match)
	const client = useQueryClient()
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
	const refresh = () => client.resetQueries({ queryKey: ["pos", "products", search], exact: true })
	const more = () => {
		if (!catalog.isFetching && !settling) void catalog.fetchNextPage()
	}
	useEffect(() => {
		const timeout = setTimeout(() => setSearch(input.trim()), input ? 300 : 0)
		return () => clearTimeout(timeout)
	}, [input])
	useEffect(() => {
		if (!detailOpen) openingCard.current?.focus()
	}, [detailOpen])
	const close = () => (location.state?.fromProducts ? navigate(-1) : navigate(base, { replace: true }))
	const scan = async (code: string, source?: "camera") => {
		if (source === "camera") {
			const item = await addScanned(code)
			return `Added ${item.name} · quantity ${item.quantity}`
		}
		const match = await lookupBarcode(code)
		if (selling && match.type !== "variable") {
			const product = await getProduct(match.id, new AbortController().signal)
			if (!["simple", "variation"].includes(product.type) || product.stock === "outofstock")
				throw new Error("This item is unavailable for sale.")
			onSelect?.(product)
		} else
			navigate(`${base}/${match.parent_id ?? match.id}${match.parent_id ? `?variation=${match.id}` : ""}`, {
				state: { fromProducts: true },
			})
	}
	return (
		<section className="pos-catalog" aria-label="Product catalog">
			<div className="pos-catalog-intro">
				<p className="pos-eyebrow">{selling ? "BUILD YOUR NEXT SALE" : "FIND SOMETHING WORTH SHARING"}</p>
				<h2>{selling ? "Scan or choose a product." : "Your store, at a glance."}</h2>
			</div>
			<ScanInput onScan={scan} autofocus={selling} />
			<div className="pos-catalog-tools">
				<label className="pos-search" htmlFor="pos-product-search">
					<span>Search products</span>
					<Input
						id="pos-product-search"
						type="search"
						value={input}
						maxLength={200}
						placeholder="Search name, exact SKU or barcode"
						onChange={(event) => setInput(event.target.value)}
					/>
				</label>
				<Button variant="outline" type="button" onClick={() => void refresh()}>
					Refresh
				</Button>
			</div>
			<p className="pos-catalog-count" role="status">
				{loading ? "Loading products…" : error && !catalog.data ? "Products unavailable" : `${items.length} of ${total} products`}
			</p>
			{error && (
				<div className="pos-error" role="alert">
					<p>{error}</p>
					<Button type="button" onClick={catalog.isFetchNextPageError ? more : () => void catalog.refetch()}>
						Try again
					</Button>
				</div>
			)}
			{!loading && !error && items.length === 0 && (
				<div className="pos-catalog-empty">
					<Icon name="products" />
					<h3>{search ? "No products found" : "Your catalog is empty"}</h3>
					<p>{search ? "Try another name, SKU or barcode." : "Published WooCommerce products will appear here."}</p>
				</div>
			)}
			<div className="pos-product-grid" aria-busy={loading}>
				{items.map((product) => (
					<Link
						className="pos-product-card"
						key={product.id}
						to={`${base}/${product.id}${product.matched_variations?.length === 1 ? `?variation=${product.matched_variations[0]}` : ""}`}
						state={{ fromProducts: true }}
						onClick={(event) => {
							openingCard.current = event.currentTarget
						}}
					>
						<ProductImage product={product} />
						<div className="pos-product-info">
							<span>{stockLabel(product.stock)}</span>
							<h3>{product.name}</h3>
							<p>{product.price ?? "Price not set"}</p>
						</div>
						<span className="pos-card-action">
							View product <span aria-hidden="true">↗</span>
						</span>
					</Link>
				))}
			</div>
			{catalog.hasNextPage && (
				<Button variant="outline" className="pos-load-more" type="button" disabled={loading || input.trim() !== search} onClick={more}>
					{loading ? "Loading…" : "Load more"}
				</Button>
			)}
			{detailOpen && (
				<ProductDetails
					key={id}
					id={id}
					onClose={close}
					theme={theme}
					onToggleTheme={onToggleTheme}
					loginUrl={loginUrl}
					onSelect={onSelect}
				/>
			)}
		</section>
	)
}

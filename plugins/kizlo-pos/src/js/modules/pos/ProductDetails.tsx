import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { useLocation, useSearchParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { apiProblem } from "./api"
import { ErrorNotice } from "./ErrorNotice"
import { Icon } from "./Icon"
import { ProductImage } from "./Products"
import { getProduct, getVariations, mergeProducts, stockLabel } from "./products-api"
import { copyLink, prepareImage, publicLink, shareFiles, shareProduct } from "./share"

export function ProductDetails({
	id,
	onClose,
	theme,
	onToggleTheme,
	loginUrl,
}: {
	id: number
	onClose: () => void
	theme: string
	onToggleTheme: () => void
	loginUrl: string
}) {
	const [portalHost, setPortalHost] = useState<HTMLElement | null>(null)
	const client = useQueryClient()
	const [params, setParams] = useSearchParams()
	const { state } = useLocation()
	const variation = Number(params.get("variation")) || 0
	const [selectionWarning, setSelectionWarning] = useState("")
	const productKey = ["pos", "product", id] as const
	const productQuery = useQuery({
		queryKey: productKey,
		queryFn: ({ signal }) => getProduct(id, signal),
	})
	const product = productQuery.data
	const selectedQuery = useQuery({
		queryKey: [...productKey, "variation", variation],
		queryFn: async ({ signal }) => {
			const value = await getProduct(variation, signal)
			if (value.parent_id !== id) throw Object.assign(new Error("This variation is unavailable."), { data: { status: 404 } })
			return value
		},
		enabled: Boolean(variation && product),
		refetchOnMount: (query) => (query.state.error ? "always" : false),
	})
	const choicesQuery = useInfiniteQuery({
		queryKey: [...productKey, "variations"],
		queryFn: ({ pageParam, signal }) => getVariations(id, pageParam, signal),
		initialPageParam: 1,
		getNextPageParam: (last) => (last.has_more ? last.page + 1 : undefined),
		enabled: product?.type === "variable",
	})
	const choices = mergeProducts([], choicesQuery.data?.pages.flatMap((page) => page.items) ?? [])
	const choicesLoading = choicesQuery.isFetching
	const choiceError = choicesQuery.error ? apiProblem(choicesQuery.error).message : ""
	const error = productQuery.error ?? selectedQuery.error
	const [sharing, setSharing] = useState(false)
	const shareLock = useRef(false)
	const [message, setMessage] = useState("")
	const [textOnly, setTextOnly] = useState(false)
	const [manual, setManual] = useState<{ label: string; value: string } | null>(null)
	const shown = variation ? selectedQuery.data : product
	const imageKey = JSON.stringify([shown?.id, shown?.image?.url, shown?.share_text, shown?.url])
	const activeImageKey = useRef(imageKey)
	activeImageKey.current = imageKey
	const imageUrl = shown?.image?.url
	const imageQuery = useQuery({
		queryKey: ["pos", "share-image", shown?.id, imageUrl],
		queryFn: ({ signal }) => (imageUrl ? prepareImage(imageUrl, signal) : Promise.resolve(null)),
		enabled: Boolean(imageUrl) && typeof navigator.canShare === "function",
		gcTime: 0,
		refetchInterval: false,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
	})
	const errorStatus = (error as { data?: { status?: number } } | null)?.data?.status
	const blockingError =
		error && (!shown || apiProblem(error).action || (errorStatus !== undefined && errorStatus >= 400 && errorStatus < 500))
	const preparing = imageQuery.isFetching
	const ready = textOnly ? [] : shareFiles(imageQuery.data ? [imageQuery.data] : [])
	const imageNotice = preparing
		? "Preparing product image…"
		: ready.length
			? "Ready to share one image with the caption."
			: globalThis.isSecureContext === false
				? "Open POS over HTTPS to share the image. You can share the caption instead."
				: "Sharing the caption only. The image is unavailable or not supported by this browser."
	const url = publicLink(shown?.url ?? null)
	useEffect(() => {
		setPortalHost(document.querySelector<HTMLElement>(".kizlo-pos-app"))
	}, [])
	useEffect(() => {
		if (!selectedQuery.isFetching && (selectedQuery.error as { data?: { status?: number } } | null)?.data?.status === 404) {
			setParams({}, { replace: true, state })
			setSelectionWarning("This variation is no longer available. Showing the product instead.")
		}
	}, [selectedQuery.error, selectedQuery.isFetching, setParams, state])
	useEffect(() => {
		setMessage("")
		setManual(null)
		setTextOnly(false)
	}, [imageKey])
	const refresh = () => client.resetQueries({ queryKey: productKey })
	const loadChoices = () => {
		if (choicesLoading) return
		if (choiceError && !choicesQuery.isFetchNextPageError) void choicesQuery.refetch()
		else void choicesQuery.fetchNextPage()
	}
	const share = () => {
		if (!shown?.share_text || preparing || shareLock.current) return
		shareLock.current = true
		setSharing(true)
		const key = imageKey
		const result = shareProduct(shown, ready)
		result
			.then((outcome) => {
				if (activeImageKey.current !== key) return
				setManual(outcome === "manual" ? { label: "Product caption", value: shown.share_text } : null)
				if (outcome === "failed") setTextOnly(true)
				setMessage(
					{
						shared: "",
						cancelled: "",
						copied: "Caption copied.",
						manual: "Select and copy the caption below.",
						failed: "Sharing failed. Try sharing text only.",
					}[outcome],
				)
			})
			.finally(() => {
				shareLock.current = false
				setSharing(false)
			})
	}
	return (
		<Sheet
			open
			onOpenChange={(open) => {
				if (!open) onClose()
			}}
		>
			{portalHost && (
				<SheetContent
					container={portalHost}
					className="pos-product-dialog"
					aria-labelledby="pos-detail-title"
					onCloseAutoFocus={(event) => {
						// Route dismissal restores focus to the product card; there is no SheetTrigger.
						event.preventDefault()
					}}
				>
					<SheetDescription className="sr-only">Product details and share caption.</SheetDescription>
					<div className="pos-detail-header">
						<span className="pos-eyebrow">PRODUCT DETAILS</span>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="pos-theme-button"
							onClick={onToggleTheme}
							aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
						>
							<Icon name={theme === "light" ? "moon" : "sun"} />
						</Button>
					</div>
					{blockingError ? (
						<div className="pos-error" role="alert">
							<SheetTitle id="pos-detail-title">Product unavailable</SheetTitle>
							<ErrorNotice problem={apiProblem(error)} loginUrl={loginUrl} />
							<Button type="button" onClick={() => void refresh()}>
								Try again
							</Button>
						</div>
					) : !shown ? (
						<SheetTitle id="pos-detail-title" role="status">
							Loading product…
						</SheetTitle>
					) : (
						<>
							{error && (
								<>
									<ErrorNotice problem={apiProblem(error)} loginUrl={loginUrl} />
									<p role="status">Showing the last loaded product details.</p>
								</>
							)}
							{selectionWarning && <p role="status">{selectionWarning}</p>}
							<ProductImage product={shown} />
							<div className="pos-detail-heading">
								<p className="pos-eyebrow">{stockLabel(shown.stock)}</p>
								<SheetTitle id="pos-detail-title">{shown.name}</SheetTitle>
								<p className="pos-detail-price">{shown.price ?? "Price not set"}</p>
							</div>
							<dl className="pos-detail-meta">
								<div>
									<dt>SKU</dt>
									<dd>{shown.sku || "Not set"}</dd>
								</div>
								<div>
									<dt>Type</dt>
									<dd>{shown.type}</dd>
								</div>
							</dl>
							{product?.type === "variable" && (
								<fieldset className="pos-variations">
									<legend>Choose a variation</legend>
									<label>
										<input type="radio" name="variation" checked={!variation} onChange={() => setParams({}, { replace: true, state })} />{" "}
										All options — {product.price ?? "Price not set"}
									</label>
									{choices.map((choice) => (
										<label key={choice.id}>
											<input
												type="radio"
												name="variation"
												value={choice.id}
												checked={variation === choice.id}
												onChange={() => setParams({ variation: String(choice.id) }, { replace: true, state })}
											/>
											<span>
												{choice.name}
												<small>
													{choice.price ?? "Price not set"} · {stockLabel(choice.stock)}
												</small>
											</span>
										</label>
									))}
									{choicesLoading && <p role="status">Loading variations…</p>}
									{choiceError && <p role="alert">{choiceError}</p>}
									{(choicesQuery.hasNextPage || choiceError) && (
										<Button variant="outline" type="button" disabled={choicesLoading} onClick={loadChoices}>
											{choiceError ? "Retry variations" : "More variations"}
										</Button>
									)}
								</fieldset>
							)}
							{shown.description && (
								<div className="pos-description">
									<h3>About this product</h3>
									<p>{shown.description}</p>
								</div>
							)}
							<div className="pos-detail-actions">
								<Button type="button" disabled={!shown.share_text || preparing || sharing} onClick={share}>
									{preparing ? "Preparing image…" : sharing ? "Sharing…" : textOnly ? "Share text only" : "Share product"}
								</Button>
								{url ? (
									<Button
										variant="outline"
										type="button"
										onClick={() => {
											const key = imageKey
											copyLink(url).then((result) => {
												if (activeImageKey.current !== key) return
												setManual(result === "manual" ? { label: "Product link", value: url } : null)
												setMessage(result === "copied" ? "Link copied." : "Select and copy the link below.")
											})
										}}
									>
										Copy link
									</Button>
								) : null}
								<Button variant="outline" type="button" onClick={() => void refresh()}>
									Refresh details
								</Button>
							</div>
							<div className="pos-description">
								<h3>Share caption</h3>
								<p>{shown.share_text}</p>
							</div>
							<p className="pos-share-status" role="status">
								{imageNotice}
							</p>
							<p className="pos-share-status" role="status">
								{message}
							</p>
							{manual && (
								<label className="pos-manual-link" htmlFor="pos-share-text">
									{manual.label}
									<Textarea id="pos-share-text" readOnly value={manual.value} onFocus={(event) => event.currentTarget.select()} />
								</label>
							)}
						</>
					)}
				</SheetContent>
			)}
		</Sheet>
	)
}

import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { apiProblem } from "./api"
import { ErrorNotice } from "./ErrorNotice"
import { ProductImage } from "./Products"
import { getProduct, getVariations, mergeProducts, type ProductCard, stockLabel } from "./products-api"
import { copyLink, prepareImage, publicLink, shareFiles, shareProduct } from "./share"

export function ProductDialog({
	id,
	open,
	onClose,
	onAfterClose,
	mode,
	initialVariation = 0,
	loginUrl,
	onSelect,
}: {
	id: number
	open: boolean
	onClose: () => void
	onAfterClose: () => void
	mode: "options" | "share"
	initialVariation?: number
	loginUrl: string
	onSelect?: (product: ProductCard) => void
}) {
	const [portalHost, setPortalHost] = useState<HTMLElement | null>(null)
	const client = useQueryClient()
	const [variation, setVariation] = useState(initialVariation)
	const [addError, setAddError] = useState("")
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
	const shown = variation ? (selectedQuery.data ?? (mode === "options" ? product : undefined)) : product
	const imageKey = JSON.stringify([shown?.id, shown?.image?.url, shown?.share_text, shown?.url])
	const activeImageKey = useRef(imageKey)
	activeImageKey.current = imageKey
	const imageUrl = shown?.image?.url
	const imageQuery = useQuery({
		queryKey: ["pos", "share-image", shown?.id, imageUrl],
		queryFn: ({ signal }) => (imageUrl ? prepareImage(imageUrl, signal) : Promise.resolve(null)),
		enabled: mode === "share" && Boolean(imageUrl) && typeof navigator.canShare === "function",
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
			setVariation(0)
			setSelectionWarning("This variation is no longer available. Showing the product instead.")
		}
	}, [selectedQuery.error, selectedQuery.isFetching])
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
		<Dialog
			open={open}
			onOpenChange={(open) => {
				if (!open) onClose()
			}}
		>
			{portalHost && (
				<DialogContent
					container={portalHost}
					className="pos-product-dialog"
					aria-labelledby="pos-detail-title"
					onCloseAutoFocus={(event) => {
						// Release the product and restore focus only after the exit animation finishes.
						event.preventDefault()
						onAfterClose()
					}}
				>
					<DialogDescription className="sr-only">
						{mode === "options" ? "Choose a variation to add to this sale." : "Share this product image and caption."}
					</DialogDescription>
					{blockingError ? (
						<div
							className="pos-error [&_a]:underline! my-3 rounded-lg border border-[#e99] bg-background p-3 text-[13px] text-foreground [&_a]:inline-block [&_a]:p-2"
							role="alert"
						>
							<DialogTitle id="pos-detail-title">Product unavailable</DialogTitle>
							<ErrorNotice problem={apiProblem(error)} loginUrl={loginUrl} />
							<Button type="button" onClick={() => void refresh()}>
								Try again
							</Button>
						</div>
					) : !shown ? (
						<>
							<DialogTitle id="pos-detail-title" className="sr-only">
								Product details
							</DialogTitle>
							<div className="flex min-h-40 items-center justify-center text-muted-foreground">
								<Spinner aria-label="Loading product" />
							</div>
						</>
					) : (
						<>
							{error && (
								<>
									<ErrorNotice problem={apiProblem(error)} loginUrl={loginUrl} />
									<p role="status">Showing the last loaded product details.</p>
									<Button type="button" variant="outline" onClick={() => void refresh()}>
										Try again
									</Button>
								</>
							)}
							{selectionWarning && <p role="status">{selectionWarning}</p>}
							{mode === "options" && variation > 0 && selectedQuery.isFetching && <p role="status">Loading option…</p>}
							{mode === "share" && <ProductImage product={shown} className="mb-4.5 size-25 rounded-lg" />}
							<div className="pos-detail-heading pr-7 [&_button]:mt-4">
								<p className="pos-eyebrow text-[11px] text-muted-foreground">{stockLabel(shown.stock)}</p>
								<DialogTitle className="mt-1 mb-2.5 text-[22px]/[1.3]" id="pos-detail-title">
									{shown.name}
								</DialogTitle>
								<p className="pos-detail-price text-lg/normal">{shown.price ?? "Price not set"}</p>
							</div>
							{addError && <p role="alert">{addError}</p>}
							{product?.type === "variable" && (
								<fieldset className="pos-variations my-5 border-0 p-0">
									<legend className="mb-2 text-[13px] text-muted-foreground">Choose an option</legend>
									{mode === "share" && (
										<label className="mt-2 flex min-h-13 cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm/normal has-[:disabled]:cursor-default has-[:checked]:border-foreground has-[:checked]:bg-accent has-[:disabled]:opacity-50">
											<input
												className="accent-foreground"
												type="radio"
												name="variation"
												checked={!variation}
												onChange={() => setVariation(0)}
											/>{" "}
											Whole product · {product.price ?? "Price not set"}
										</label>
									)}
									{choices.map((choice) => (
										<label
											className="mt-2 flex min-h-13 cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm/normal has-[:disabled]:cursor-default has-[:checked]:border-foreground has-[:checked]:bg-accent has-[:disabled]:opacity-50"
											key={choice.id}
										>
											<input
												className="accent-foreground"
												type="radio"
												name="variation"
												value={choice.id}
												disabled={mode === "options" && (choice.stock === "outofstock" || choice.price === null)}
												checked={variation === choice.id}
												onChange={() => setVariation(choice.id)}
											/>
											<span>
												{choice.name}
												<small className="mt-0.75 block text-muted-foreground">
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
							{mode === "options" && onSelect && (
								<Button
									type="button"
									className="pos-option-add w-full"
									disabled={!["simple", "variation"].includes(shown.type) || shown.stock === "outofstock" || shown.price === null}
									onClick={() => {
										try {
											onSelect(shown)
											onClose()
										} catch (failure) {
											setAddError(apiProblem(failure).message)
										}
									}}
								>
									Add to sale
								</Button>
							)}
							{mode === "share" && (
								<>
									<div className="pos-detail-actions mt-5 flex flex-wrap gap-2">
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
									<div className="pos-description mt-5">
										<h3 className="mb-1.5 font-bold text-muted-foreground text-xs/normal">Share caption</h3>
										<p className="wrap-anywhere whitespace-pre-line text-sm/normal">{shown.share_text}</p>
									</div>
									<p className="pos-share-status mt-3! block text-muted-foreground text-xs/normal" role="status">
										{imageNotice}
									</p>
									<p className="pos-share-status mt-3! block text-muted-foreground text-xs/normal" role="status">
										{message}
									</p>
									{manual && (
										<label className="pos-manual-link mt-3! block text-muted-foreground text-xs/normal" htmlFor="pos-share-text">
											{manual.label}
											<Textarea
												className="min-h-27.5 resize-y"
												id="pos-share-text"
												readOnly
												value={manual.value}
												onFocus={(event) => event.currentTarget.select()}
											/>
										</label>
									)}
								</>
							)}
						</>
					)}
				</DialogContent>
			)}
		</Dialog>
	)
}

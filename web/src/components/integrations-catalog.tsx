"use client"

import { ListFilter, Search } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useMemo, useState } from "react"
import type { Integration, IntegrationType } from "@/lib/kizlo/integrations"
import { cn } from "@/lib/utils"

const TYPE_LABELS: Record<IntegrationType, string> = {
	package: "Package",
	plugin: "Plugin",
	both: "Package + Plugin",
}

export function IntegrationsCatalog({ integrations }: { integrations: Integration[] }) {
	const router = useRouter()
	const pathname = usePathname()
	const searchParams = useSearchParams()

	// Search stays local: it changes on every keystroke, so putting it in the URL would flood history
	// and fight the back-button behaviour the category filter relies on.
	const [query, setQuery] = useState("")
	const normalizedQuery = query.trim().toLowerCase()

	const activeCategories = useMemo(() => new Set(searchParams.getAll("category")), [searchParams])

	// The options are whatever the catalog actually contains, so a category with no entries never shows.
	const categories = useMemo(() => {
		const bySlug = new Map<string, string>()
		for (const integration of integrations) {
			for (const category of integration.categories) bySlug.set(category.slug, category.name)
		}
		return [...bySlug].map(([slug, name]) => ({ slug, name })).sort((a, b) => a.name.localeCompare(b.name))
	}, [integrations])

	// Several categories narrow to their union: an entry shows when it matches any checked category.
	// Search then narrows that further, matching the fields someone would plausibly type.
	const visible = useMemo(
		() =>
			integrations.filter((integration) => {
				if (activeCategories.size > 0 && !integration.categories.some((category) => activeCategories.has(category.slug))) return false
				if (!normalizedQuery) return true
				const haystack = [
					integration.name,
					integration.description,
					integration.npmPackage ?? "",
					integration.pluginSlug ?? "",
					...integration.categories.map((category) => category.name),
				]
					.join(" ")
					.toLowerCase()
				return haystack.includes(normalizedQuery)
			}),
		[integrations, activeCategories, normalizedQuery],
	)

	// Write the selection into the URL so a filtered view is shareable and the back button restores the
	// previous one. Values are sorted so the same selection always produces the same URL.
	function replaceCategories(next: Set<string>) {
		const params = new URLSearchParams(searchParams)
		params.delete("category")
		for (const value of [...next].sort()) params.append("category", value)
		const search = params.toString()
		router.push(search ? `${pathname}?${search}` : pathname, { scroll: false })
	}

	function toggleCategory(slug: string) {
		const next = new Set(activeCategories)
		if (next.has(slug)) next.delete(slug)
		else next.add(slug)
		replaceCategories(next)
	}

	const hasActiveFilters = activeCategories.size > 0 || query.length > 0

	return (
		<div className="grid flex-1 grid-cols-1 lg:grid-cols-[15rem_1fr]">
			<aside className="border-fd-border border-b py-8 lg:border-r lg:border-b-0 lg:py-10 lg:pr-6">
				<div className="lg:sticky lg:top-24">
					<div className="flex items-center justify-between gap-2">
						<div className="flex items-center gap-2">
							<ListFilter aria-hidden className="size-4 text-fd-muted-foreground" />
							<h2 className="font-semibold text-fd-foreground text-sm">Filters</h2>
						</div>
						{hasActiveFilters && (
							<button
								type="button"
								onClick={() => {
									setQuery("")
									replaceCategories(new Set())
								}}
								className="font-medium text-fd-muted-foreground text-xs transition-colors hover:text-fd-foreground"
							>
								Clear all
							</button>
						)}
					</div>

					<div className="mt-4">
						<div className="relative">
							<Search
								aria-hidden
								className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fd-muted-foreground"
							/>
							<input
								type="search"
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder="Search integrations"
								aria-label="Search integrations"
								className="w-full rounded-lg border border-fd-border bg-fd-card py-2 pr-3 pl-8 text-fd-foreground text-sm outline-none transition-colors placeholder:text-fd-muted-foreground focus:border-fd-foreground/30"
							/>
						</div>

						{categories.length > 0 && (
							<div className="mt-6">
								<p className="mb-2 font-medium text-fd-muted-foreground text-xs uppercase tracking-wide">Category</p>
								<div className="-mx-2 flex flex-col gap-0.5">
									{categories.map((category) => {
										const checked = activeCategories.has(category.slug)
										return (
											<label
												key={category.slug}
												className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-fd-muted/60"
											>
												<input
													type="checkbox"
													checked={checked}
													onChange={() => toggleCategory(category.slug)}
													className="size-3.5 shrink-0 accent-fd-foreground"
												/>
												<span className={cn("font-medium text-sm", checked ? "text-fd-foreground" : "text-fd-muted-foreground")}>
													{category.name}
												</span>
											</label>
										)
									})}
								</div>
							</div>
						)}
					</div>
				</div>
			</aside>

			<div className="py-8 lg:py-10 lg:pl-10">
				{visible.length === 0 ? (
					<p className="rounded-xl border border-fd-border border-dashed py-16 text-center text-fd-muted-foreground text-sm">
						No integrations match these filters.
					</p>
				) : (
					<ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						{visible.map((integration) => (
							<li key={integration.slug}>
								<IntegrationCard integration={integration} />
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	)
}

function IntegrationCard({ integration }: { integration: Integration }) {
	return (
		<Link
			href={`/integrations/${integration.slug}`}
			className="group flex h-full flex-col rounded-xl border border-fd-border bg-fd-card p-5 transition-colors hover:border-fd-foreground/30"
		>
			<div className="flex items-center gap-3">
				{integration.logoUrl ? (
					<img src={integration.logoUrl} alt={integration.logoAlt ?? ""} className="h-10 w-10 rounded-md object-contain" />
				) : (
					<div
						aria-hidden
						className="flex h-10 w-10 items-center justify-center rounded-md bg-fd-muted font-semibold text-fd-muted-foreground"
					>
						{integration.name.charAt(0)}
					</div>
				)}
				<h2 className="font-semibold text-fd-foreground">{integration.name}</h2>
			</div>

			{integration.description && (
				<p className="mt-3 line-clamp-3 text-fd-muted-foreground text-sm leading-relaxed">{integration.description}</p>
			)}

			<div className="mt-4 flex flex-wrap items-center gap-2 pt-1">
				{integration.type && (
					<span className="rounded-full border border-fd-border px-2.5 py-0.5 font-medium text-fd-muted-foreground text-xs">
						{TYPE_LABELS[integration.type]}
					</span>
				)}
				{integration.categories.map((category) => (
					<span key={category.slug} className="rounded-full bg-fd-muted px-2.5 py-0.5 font-medium text-fd-muted-foreground text-xs">
						{category.name}
					</span>
				))}
			</div>
		</Link>
	)
}

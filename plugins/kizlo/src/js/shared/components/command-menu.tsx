import { useStore } from "@nanostores/react"
import { CaretRightIcon, MagnifyingGlassIcon } from "@phosphor-icons/react"
import { Fragment, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, Kbd } from "@/shared/components/ui/command"
import { resolveIcon } from "@/shared/lib/icons"
import { useNav } from "@/shared/lib/nav"
import { $search } from "@/shared/lib/store"
import type { NavBlock, NavPage } from "@/shared/lib/types"
import { cn } from "@/shared/lib/utils"

/** A flat, searchable navigation target: a page or one of its sections. */
interface Entry {
	/** Stable id (the route, with hash for sections) — also the recents key. */
	key: string
	/** Navigation target passed to the router. */
	path: string
	title: string
	/** Icon name. */
	icon: string
	/** Ancestor labels leading to this entry, e.g. ["Post Types", "Book"]. */
	crumbs: string[]
	/** Whether this is a page (vs. a section within one). */
	isPage: boolean
}

/** cmdk search string for an entry: its breadcrumb plus its own title. */
function entryValue(entry: Entry): string {
	return [...entry.crumbs, entry.title].join(" ")
}

/**
 * Flatten the served nav into one entry per page and per section. A section's
 * breadcrumb carries its group (for a custom post type / taxonomy) and page, so
 * a "SEO" section reads as e.g. "Post Types › Book › SEO" — enough signal to
 * tell duplicate section names apart in a flat result list.
 */
function flatten(blocks: NavBlock[]): Entry[] {
	const out: Entry[] = []

	const pushPage = (page: NavPage, crumbs: string[]) => {
		out.push({ key: page.path, path: page.path, title: page.name, icon: page.icon, crumbs, isPage: true })
		for (const section of page.sections) {
			const path = `${page.path}#${section.id}`
			out.push({ key: path, path, title: section.title, icon: section.icon, crumbs: [...crumbs, page.name], isPage: false })
		}
	}

	for (const block of blocks) {
		for (const node of block.items) {
			if (node.type === "page") pushPage(node, [])
			else for (const page of node.items) pushPage(page, [node.name])
		}
	}

	return out
}

function EntryItem({ entry, onSelect }: { entry: Entry; onSelect: (entry: Entry) => void }) {
	const Icon = resolveIcon(entry.icon)

	return (
		<CommandItem value={entryValue(entry)} onSelect={() => onSelect(entry)}>
			<Icon />
			<span className="flex min-w-0 items-center gap-1">
				{entry.crumbs.map((crumb) => (
					<Fragment key={crumb}>
						<span className="truncate text-neutral-400">{crumb}</span>
						<CaretRightIcon className="size-3 shrink-0 text-neutral-300" />
					</Fragment>
				))}
				<span className="truncate text-neutral-900">{entry.title}</span>
			</span>
		</CommandItem>
	)
}

// ── Recents (localStorage) ──────────────────────────────────────────────────

const RECENTS_KEY = "kizlo:settings-recents"
const RECENTS_MAX = 6

function loadRecents(): string[] {
	try {
		const parsed = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]")
		return Array.isArray(parsed) ? parsed.filter((k: unknown): k is string => typeof k === "string") : []
	} catch {
		return []
	}
}

function isTypingTarget(target: EventTarget | null) {
	const el = target as HTMLElement | null
	if (!el) return false
	return el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT"
}

export function CommandMenu() {
	const open = useStore($search)
	const blocks = useNav()
	const navigate = useNavigate()

	const [query, setQuery] = useState("")
	const [recents, setRecents] = useState<string[]>(loadRecents)

	// Reset the query each time the finder opens.
	useEffect(() => {
		if (open) setQuery("")
	}, [open])

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "f" && event.key !== "F") return
			if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return
			event.preventDefault()
			$search.set(true)
		}

		document.addEventListener("keydown", onKeyDown)
		return () => document.removeEventListener("keydown", onKeyDown)
	}, [])

	const entries = useMemo(() => flatten(blocks), [blocks])
	const byKey = useMemo(() => new Map(entries.map((entry) => [entry.key, entry])), [entries])

	const go = (entry: Entry) => {
		setRecents((prev) => {
			const next = [entry.key, ...prev.filter((key) => key !== entry.key)].slice(0, RECENTS_MAX)
			try {
				localStorage.setItem(RECENTS_KEY, JSON.stringify(next))
			} catch {}
			return next
		})
		$search.set(false)
		navigate(entry.path)
	}

	const searching = query.trim().length > 0

	// At rest: recently clicked entries, or the top-level pages on first use.
	const recentEntries = recents.map((key) => byKey.get(key)).filter((entry): entry is Entry => Boolean(entry))
	const resting = recentEntries.length > 0 ? recentEntries : entries.filter((entry) => entry.isPage)

	return (
		<CommandDialog open={open} onOpenChange={(next) => $search.set(next)}>
			<CommandInput placeholder="Search settings..." value={query} onValueChange={setQuery} />
			<CommandList>
				<CommandEmpty>No results found.</CommandEmpty>

				{searching ? (
					<CommandGroup>
						{entries.map((entry) => (
							<EntryItem key={entry.key} entry={entry} onSelect={go} />
						))}
					</CommandGroup>
				) : (
					<CommandGroup heading={recentEntries.length > 0 ? "Recent" : "Settings"}>
						{resting.map((entry) => (
							<EntryItem key={entry.key} entry={entry} onSelect={go} />
						))}
					</CommandGroup>
				)}
			</CommandList>
		</CommandDialog>
	)
}

export function CommandTrigger({ className }: { className?: string }) {
	return (
		<button
			type="button"
			aria-label="Search settings"
			onClick={() => $search.set(true)}
			className={cn(
				"flex h-10 w-full cursor-pointer appearance-none items-center gap-2 rounded-md border border-neutral-200 bg-white pr-1.5 pl-2.5 text-neutral-500 text-sm transition-colors hover:border-neutral-300 hover:text-neutral-700",
				className,
			)}
		>
			<MagnifyingGlassIcon className="size-4 shrink-0" />
			<span className="flex-1 truncate text-left">Search settings...</span>
			<Kbd>F</Kbd>
		</button>
	)
}

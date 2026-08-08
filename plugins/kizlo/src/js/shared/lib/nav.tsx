import { useStore } from "@nanostores/react"
import { type ReactNode, useMemo } from "react"
import { z } from "zod"
import { SectionDesc } from "@/shared/components/section-desc"
import { hasIcon } from "./icons"
import { $settings } from "./store"
import type { NavBlock, NavNode, NavPage, NavVariant } from "./types"

// ── Boundary guard ──────────────────────────────────────────────────────────
// A runtime mirror of the served shape (see types.ts). PHP builds the nav, so a
// shape drift between the two sides should fail loudly rather than render wrong.

const NavSectionSchema = z.object({
	id: z.string(),
	title: z.string(),
	desc: z.string().optional(),
	icon: z.string(),
})

const NavDeleteSchema = z.object({
	label: z.string(),
	desc: z.string(),
})

const NavVariantSchema = z.enum(["drill", "collapse"])

const NavPageSchema = z.object({
	type: z.literal("page"),
	id: z.string(),
	name: z.string(),
	path: z.string(),
	icon: z.string(),
	variant: NavVariantSchema.optional(),
	inactive: z.boolean().optional(),
	sections: z.array(NavSectionSchema),
	delete: NavDeleteSchema.nullish(),
})

const NavCreateSchema = z.object({
	path: z.string(),
	label: z.string(),
})

const NavDrillGroupSchema = z.object({
	type: z.literal("group"),
	id: z.string(),
	name: z.string(),
	icon: z.string(),
	variant: NavVariantSchema.optional(),
	create: NavCreateSchema.optional(),
	items: z.array(NavPageSchema),
})

const NavSchema = z.array(z.object({ label: z.string(), items: z.array(z.union([NavPageSchema, NavDrillGroupSchema])) }))

/** Parse the served nav, logging visibly on drift and best-effort rendering the raw value. */
export function parseNav(raw: unknown): NavBlock[] {
	const result = NavSchema.safeParse(raw)

	if (!result.success) {
		console.error("[kizlo] Settings nav failed validation — the sidebar may be incomplete.", result.error.issues)
		return Array.isArray(raw) ? (raw as NavBlock[]) : []
	}

	assertIcons(result.data)
	return result.data
}

/** Warn on any served icon name that has no entry in resolveIcon (nav drift). */
function assertIcons(blocks: NavBlock[]): void {
	const missing = new Set<string>()
	const check = (name: string) => {
		if (!hasIcon(name)) missing.add(name)
	}

	for (const block of blocks) {
		for (const node of block.items) {
			check(node.icon)
			const pages = node.type === "group" ? node.items : [node]
			for (const page of pages) {
				for (const section of page.sections) check(section.icon)
			}
		}
	}

	if (missing.size > 0) console.warn(`[kizlo] Nav icons missing from resolveIcon: ${[...missing].join(", ")}`)
}

// ── Accessors ─────────────────────────────────────────────────────────────

/** All pages in a nav tree, flattening drill groups. */
function allPages(blocks: NavBlock[]): NavPage[] {
	return blocks.flatMap((block) => block.items).flatMap((node) => (node.type === "group" ? node.items : [node]))
}

/** How a node reveals its children in the sidebar. Falls back to `drill`. */
export function navVariant(node: NavNode): NavVariant {
	return node.variant ?? "drill"
}

/** The sidebar jump-links for a page: one per section. */
export function pageJumpLinks(page: NavPage): { id: string; name: string; icon: string }[] {
	return page.sections.map((section) => ({ id: section.id, name: section.title, icon: section.icon }))
}

// ── Static section copy (bootstrap snapshot) ───────────────────────────────
// Static-page section copy never changes at runtime, so it is read once from
// the bootstrap payload rather than the reactive store.

let bootstrapNav: NavBlock[] | null = null

function getBootstrapNav(): NavBlock[] {
	if (bootstrapNav === null) bootstrapNav = parseNav($settings.get()?.nav ?? [])
	return bootstrapNav
}

interface SectionHeading {
	id: string
	title: ReactNode
	desc?: ReactNode
}

/**
 * Lookup for a static page's sections, keyed by id and ready to spread onto a
 * section component: `<SettingsSection {...S("site-identity")} />`. Throws on an
 * unknown id so a typo (or a nav drift) surfaces immediately.
 */
export function sectionsFor(pageId: string): (sectionId: string) => SectionHeading {
	const page = allPages(getBootstrapNav()).find((candidate) => candidate.id === pageId)
	const sections = page?.sections ?? []
	const map = new Map(sections.map((section) => [section.id, section]))

	return (sectionId) => {
		const found = map.get(sectionId)
		if (!found) throw new Error(`Unknown settings section: ${pageId}/${sectionId}`)
		return { id: found.id, title: found.title, desc: <SectionDesc html={found.desc} /> }
	}
}

// ── Reactive nav (sidebar + command menu + dynamic pages) ──────────────────

/** The parsed nav from the store, reactive to create/delete/rename. */
export function useNav(): NavBlock[] {
	const settings = useStore($settings)
	return useMemo(() => parseNav(settings?.nav ?? []), [settings?.nav])
}

/** The served page for a route path, reactive to renames. */
export function useNavPage(path: string): NavPage | undefined {
	const nav = useNav()
	return useMemo(() => allPages(nav).find((page) => page.path === path), [nav, path])
}

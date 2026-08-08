import { useStore } from "@nanostores/react"
import { BookOpenIcon, CaretRightIcon, DiscordLogoIcon, GithubLogoIcon, type Icon, PlusIcon } from "@phosphor-icons/react"
import { Fragment, useEffect, useState } from "react"
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom"
import { Logo } from "@/modules/settings/shared/logo"
import { NotFound } from "@/modules/settings/shared/not-found"
import { CommandMenu, CommandTrigger } from "@/shared/components/command-menu"
import { ScrollManager } from "@/shared/components/scroll-manager"
import { Shell, ShellBody, ShellHeader, ShellMain, ShellSidebar } from "@/shared/components/shell"
import {
	SidebarBack,
	SidebarBadge,
	SidebarButton,
	SidebarDrillDown,
	SidebarFooter,
	SidebarHeader,
	SidebarLink,
	SidebarPanel,
	SidebarSection,
} from "@/shared/components/sidebar"
import { ComponentGallery } from "@/shared/components/ui/gallery"
import { resolveIcon } from "@/shared/lib/icons"
import { navVariant, pageJumpLinks, useNav } from "@/shared/lib/nav"
import { $sidebar } from "@/shared/lib/store"
import type { NavBlock, NavDrillGroup, NavPage } from "@/shared/lib/types"
import { cn } from "@/shared/lib/utils"
import { AuthorsSettingsPage } from "./general/authors"
import { BrandSettingsPage } from "./general/brand"
import { CrawlingSettingsPage } from "./general/crawling"
import { IdentitySettingsPage } from "./general/identity"
import { SiteSettingsPage } from "./general/site"
import { PostTypeSettingsPage } from "./post-type"
import { CreatePostTypePage, CreateTaxonomyPage } from "./registration/create"
import { HeadlessSettingsPage } from "./system/headless"
import { UploadsSettingsPage } from "./system/uploads"
import { WebhookSettingsPage } from "./system/webhook"
import { TaxonomySettingsPage } from "./taxonomy"

const HEADER_LINKS: { label: string; href: string; icon: Icon }[] = [
	{ label: "Documentation", href: "https://kizlo.io/docs", icon: BookOpenIcon },
	{ label: "Discord", href: "https://discord.com/invite/MjAUZamx5g", icon: DiscordLogoIcon },
	{ label: "GitHub", href: "https://github.com/kizlo-io/kizlo", icon: GithubLogoIcon },
]

export default function App() {
	return (
		<Routes>
			<Route path="/" element={<Layout />}>
				<Route index element={<Navigate to="/general/site" replace />} />
				<Route path="/general/site" element={<SiteSettingsPage />} />
				<Route path="/general/branding" element={<BrandSettingsPage />} />
				<Route path="/general/identity" element={<IdentitySettingsPage />} />
				<Route path="/general/authors" element={<AuthorsSettingsPage />} />
				<Route path="/general/crawling" element={<CrawlingSettingsPage />} />
				<Route path="/post-types/new" element={<CreatePostTypePage />} />
				<Route path="/post-types/:slug" element={<PostTypeSettingsPage />} />
				<Route path="/taxonomies/new" element={<CreateTaxonomyPage />} />
				<Route path="/taxonomies/:slug" element={<TaxonomySettingsPage />} />
				<Route path="/system/webhooks" element={<WebhookSettingsPage />} />
				<Route path="/system/uploads" element={<UploadsSettingsPage />} />
				<Route path="/system/headless" element={<HeadlessSettingsPage />} />

				<Route path="/preview" element={<ComponentGallery />} />

				<Route path="*" element={<NotFound />} />
			</Route>
		</Routes>
	)
}

function Layout() {
	const sidebarOpen = useStore($sidebar)

	return (
		<Shell>
			<ScrollManager />

			<ShellSidebar open={sidebarOpen} onClose={() => $sidebar.set(false)}>
				<Sidebar />
			</ShellSidebar>

			<ShellMain>
				<ShellHeader>
					<Logo className="md:hidden" />

					<div className="ml-auto flex items-center gap-0.5">
						{HEADER_LINKS.map((link) => (
							<a
								key={link.href}
								href={link.href}
								target="_blank"
								rel="noreferrer"
								aria-label={link.label}
								className="no-underline! flex size-8 items-center justify-center rounded-md text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
							>
								<link.icon className="size-5" />
							</a>
						))}
					</div>
				</ShellHeader>

				<ShellBody>
					<Outlet />
				</ShellBody>
			</ShellMain>

			<CommandMenu />
		</Shell>
	)
}

/**
 * Resolve which nodes must be open to reveal the current route: the drill `stack`
 * of sliding panels plus the ids of `collapse` nodes whose children hold it. A
 * node contributes to whichever set matches its variant, so a route reached
 * through a collapse group never pushes that group onto the drill stack.
 */
function resolveOpen(blocks: NavBlock[], pathname: string): { stack: string[]; expanded: string[] } {
	const stack: string[] = []
	const expanded: string[] = []

	const open = (node: NavPage | NavDrillGroup, hasChildren: boolean) => {
		if (!hasChildren) return
		if (navVariant(node) === "collapse") expanded.push(node.id)
		else stack.push(node.id)
	}

	for (const block of blocks) {
		for (const node of block.items) {
			if (node.type === "page") {
				if (node.path === pathname) {
					open(node, pageJumpLinks(node).length > 0)
					return { stack, expanded }
				}
				continue
			}

			if (node.create?.path === pathname) {
				open(node, true)
				return { stack, expanded }
			}

			for (const page of node.items) {
				if (page.path === pathname) {
					open(node, true)
					open(page, pageJumpLinks(page).length > 0)
					return { stack, expanded }
				}
			}
		}
	}

	return { stack, expanded }
}

/**
 * The collapse nodes that must stay open to reveal a node: its collapse ancestors
 * plus itself. Used by the accordion so opening a nested child doesn't close the
 * parent that contains it.
 */
function collapseChain(blocks: NavBlock[], id: string): string[] {
	for (const block of blocks) {
		for (const node of block.items) {
			if (node.id === id) return [id]
			if (node.type === "group") {
				for (const page of node.items) {
					if (page.id === id) return navVariant(node) === "collapse" ? [node.id, id] : [id]
				}
			}
		}
	}

	return [id]
}

/** Wraps the inline children of an expanded collapse node, indenting them and hosting the tree guide. */
function TreeGroup({ children }: { children: React.ReactNode }) {
	return <div className="relative ml-5 flex flex-col">{children}</div>
}

/**
 * Tree-line classes for one inline collapse child: a vertical guide down the left
 * plus a horizontal connector into the row. `isLast` trims the guide to the
 * connector so the line ends cleanly at the final child.
 */
function treeRow(isLast: boolean): string {
	return cn(
		"relative pl-5",
		"before:absolute before:left-0 before:w-px before:bg-neutral-200 before:content-['']",
		isLast ? "before:top-0 before:h-1/2" : "before:inset-y-0",
		"after:absolute after:left-0 after:top-1/2 after:h-px after:w-3 after:bg-neutral-200 after:content-['']",
	)
}

/** The expand/collapse caret for a collapse row, toggling without triggering the row's link. */
function CollapseToggle({ open, label, onToggle }: { open: boolean; label: string; onToggle: () => void }) {
	return (
		<button
			type="button"
			aria-label={`Toggle ${label}`}
			aria-expanded={open}
			onClick={(event) => {
				event.preventDefault()
				event.stopPropagation()
				onToggle()
			}}
			className="relative flex size-8 shrink-0 cursor-pointer appearance-none items-center justify-center rounded-xs border-0 bg-transparent text-neutral-500 transition-colors hover:bg-neutral-200 hover:text-neutral-900"
		>
			<CaretRightIcon className={cn("size-4 transition-transform", open && "rotate-90")} />
		</button>
	)
}

/**
 * Scroll-spy: the id of the section currently under the header, driving the
 * sidebar's active jump-link as the page scrolls. Watches the sections named by
 * `ids` (in document order) and returns whichever one has scrolled up to the
 * header line; the last section wins once the page is scrolled to the bottom so a
 * short final section still highlights. Returns `null` when disabled or before a
 * section is measured, letting the hash-based highlight stand. Visual only — it
 * never rewrites the URL hash, so it won't spam history or retrigger the scroll
 * manager.
 */
function useActiveSection(ids: string[], enabled: boolean): string | null {
	const key = ids.join("|")
	const [active, setActive] = useState<string | null>(null)

	useEffect(() => {
		const sectionIds = key ? key.split("|") : []
		if (!enabled || sectionIds.length === 0) {
			setActive(null)
			return
		}

		let frame = 0
		const compute = () => {
			frame = 0
			let current: string | null = sectionIds[0] ?? null
			for (const id of sectionIds) {
				const el = document.getElementById(id)
				if (!el) continue
				// scrollMarginTop resolves the section's scroll-mt: the offset its top
				// lands at when jumped to. Put the detection line a third of the way
				// down from there so a clicked section (top parked at the offset) — or a
				// near-bottom one that can't scroll all the way up — still counts as
				// active instead of crediting the section above it.
				const offset = Number.parseFloat(getComputedStyle(el).scrollMarginTop) || 0
				const line = offset + (window.innerHeight - offset) / 3
				if (el.getBoundingClientRect().top <= line) current = id
			}
			// The last section may be too short to ever reach the line; at the page
			// bottom it's the one in view, so force it.
			if (window.innerHeight + Math.ceil(window.scrollY) >= document.documentElement.scrollHeight - 2) {
				current = sectionIds[sectionIds.length - 1] ?? current
			}
			setActive(current)
		}

		const onScroll = () => {
			if (!frame) frame = requestAnimationFrame(compute)
		}

		compute()
		window.addEventListener("scroll", onScroll, { passive: true })
		window.addEventListener("resize", onScroll)
		return () => {
			if (frame) cancelAnimationFrame(frame)
			window.removeEventListener("scroll", onScroll)
			window.removeEventListener("resize", onScroll)
		}
	}, [key, enabled])

	return active
}

function Sidebar() {
	const blocks = useNav()
	const navigate = useNavigate()
	const { pathname, hash } = useLocation()

	const groups = blocks.flatMap((block) => block.items).filter((node): node is NavDrillGroup => node.type === "group")
	const pages = blocks.flatMap((block) => block.items).flatMap((node) => (node.type === "group" ? node.items : [node]))

	// Only drill-variant nodes get their own sliding panel; collapse nodes reveal
	// their children inline inside the panel they already live in.
	const drillGroups = groups.filter((group) => navVariant(group) === "drill")
	const drillablePages = pages.filter((page) => pageJumpLinks(page).length > 0 && navVariant(page) === "drill")

	// Scroll-spy for the section links of whichever page is currently open, so the
	// active jump-link tracks what's in view rather than staying pinned to the hash.
	const currentPage = pages.find((page) => page.path === pathname)
	const sectionIds = currentPage ? pageJumpLinks(currentPage).map((link) => link.id) : []
	const activeSection = useActiveSection(sectionIds, sectionIds.length > 0)

	const [stack, setStack] = useState<string[]>(() => resolveOpen(blocks, pathname).stack)
	const [expanded, setExpanded] = useState<Set<string>>(() => new Set(resolveOpen(blocks, pathname).expanded))

	// Landing on a page opens the branch that reveals it. Re-runs when the nav data
	// arrives (settings load asynchronously) as well as on navigation. Both sets are
	// exclusive (accordion): only the active branch stays open, so navigating away
	// closes whatever collapse section was showing.
	useEffect(() => {
		const target = resolveOpen(blocks, pathname)
		setStack(target.stack)
		setExpanded(new Set(target.expanded))
		$sidebar.set(false)
	}, [pathname, blocks])

	const back = () => setStack((current) => current.slice(0, -1))
	const closeDrawer = () => $sidebar.set(false)
	// Accordion: opening a node keeps only its own branch (its collapse ancestors
	// plus itself), closing every sibling; closing just drops the node.
	const toggle = (id: string) =>
		setExpanded((current) => {
			if (!current.has(id)) return new Set(collapseChain(blocks, id))
			const next = new Set(current)
			next.delete(id)
			return next
		})

	// A page's section jump-links. `tree` draws the connecting tree lines when the
	// links are shown inline (collapse); the drill panel renders them flat.
	const sectionRows = (page: NavPage, tree: boolean) =>
		pageJumpLinks(page).map((link, index, links) => (
			<SidebarLink
				key={link.id}
				to={`${page.path}#${link.id}`}
				icon={resolveIcon(link.icon)}
				className={tree ? treeRow(index === links.length - 1) : undefined}
				onClick={closeDrawer}
				active={pathname === page.path && link.id === (activeSection ?? hash.slice(1))}
			>
				{link.name}
			</SidebarLink>
		))

	// A page row. In a collapse node's inline list it takes `tree` styling; drill
	// pages reveal their sections in a sliding panel, collapse pages reveal them
	// inline just below the row.
	const renderPage = (page: NavPage, tree?: { isLast: boolean }) => {
		const jumpLinks = pageJumpLinks(page)
		const firstSection = jumpLinks[0]
		const collapsible = jumpLinks.length > 0 && navVariant(page) === "collapse"
		const drillable = jumpLinks.length > 0 && navVariant(page) === "drill"
		const isOpen = expanded.has(page.id)

		return (
			<Fragment key={page.id}>
				<SidebarLink
					to={firstSection ? `${page.path}#${firstSection.id}` : page.path}
					icon={resolveIcon(page.icon)}
					className={tree ? treeRow(tree.isLast) : undefined}
					onClick={() => {
						closeDrawer()
						const target = resolveOpen(blocks, page.path)
						setStack(target.stack)
						setExpanded((current) => new Set([...current, ...target.expanded]))
					}}
					trailing={
						page.inactive ? (
							<SidebarBadge>Inactive</SidebarBadge>
						) : collapsible ? (
							<CollapseToggle open={isOpen} label={page.name} onToggle={() => toggle(page.id)} />
						) : drillable ? (
							<CaretRightIcon className="size-4 shrink-0 text-neutral-400" />
						) : null
					}
				>
					{page.name}
				</SidebarLink>

				{collapsible && isOpen ? <TreeGroup>{sectionRows(page, true)}</TreeGroup> : null}
			</Fragment>
		)
	}

	// A parent group row. Drill groups slide their child pages in over the root
	// list; collapse groups expand them inline just below the row.
	const renderGroup = (group: NavDrillGroup) => {
		const createPath = group.create?.path
		const active = group.items.some((item) => item.path === pathname)
		const isOpen = expanded.has(group.id)

		const createButton = createPath ? (
			<button
				type="button"
				aria-label={`Add ${group.name}`}
				onClick={(event) => {
					event.stopPropagation()
					closeDrawer()
					navigate(createPath)
				}}
				className="relative flex size-8 shrink-0 cursor-pointer appearance-none items-center justify-center rounded-xs border-0 bg-transparent text-neutral-500 transition-colors hover:bg-neutral-200 hover:text-neutral-900"
			>
				<PlusIcon className="size-4" />
			</button>
		) : null

		if (navVariant(group) === "collapse") {
			return (
				<Fragment key={group.id}>
					<SidebarButton
						icon={resolveIcon(group.icon)}
						active={active}
						aria-expanded={isOpen}
						trailing={
							<span className="flex items-center gap-0.5">
								{createButton}
								<CaretRightIcon className={cn("size-4 shrink-0 text-neutral-400 transition-transform", isOpen && "rotate-90")} />
							</span>
						}
						onClick={() => toggle(group.id)}
					>
						{group.name}
					</SidebarButton>

					{isOpen ? (
						<TreeGroup>{group.items.map((page, index, items) => renderPage(page, { isLast: index === items.length - 1 }))}</TreeGroup>
					) : null}
				</Fragment>
			)
		}

		return (
			<div key={group.id} className="flex items-center gap-0.5">
				<SidebarButton
					className="flex-1"
					icon={resolveIcon(group.icon)}
					active={active}
					trailing={createButton ?? <CaretRightIcon className="size-4 shrink-0" />}
					onClick={() => setStack((current) => [...current, group.id])}
				>
					{group.name}
				</SidebarButton>
			</div>
		)
	}

	return (
		<>
			<SidebarHeader>
				<div className="p-3">
					<Logo />
				</div>

				<CommandTrigger />
			</SidebarHeader>

			<SidebarDrillDown>
				{/* Static fades hint at scrollable content above and below the fold. */}
				<div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-10 h-6 bg-linear-to-b from-white to-transparent" />
				<div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-6 bg-linear-to-t from-white to-transparent" />

				<SidebarPanel stack={stack} className="py-4">
					{blocks.map((block) => (
						<SidebarSection key={block.label} label={block.label}>
							{block.items.map((node) => (node.type === "page" ? renderPage(node) : renderGroup(node)))}
						</SidebarSection>
					))}
				</SidebarPanel>

				{drillGroups.map((group) => (
					<SidebarPanel key={group.id} panelId={group.id} stack={stack}>
						<SidebarBack onClick={back}>{group.name}</SidebarBack>

						{group.items.map((page) => renderPage(page))}
					</SidebarPanel>
				))}

				{drillablePages.map((page) => (
					<SidebarPanel key={page.id} panelId={page.id} stack={stack}>
						<SidebarBack onClick={back}>{page.name}</SidebarBack>

						{sectionRows(page, false)}
					</SidebarPanel>
				))}
			</SidebarDrillDown>

			<SidebarFooter>
				<a
					href="https://kizlo.io/docs"
					target="_blank"
					rel="noreferrer"
					className="no-underline! group flex items-center gap-3 rounded-md border border-neutral-200 p-2.5 transition-colors hover:bg-neutral-50"
				>
					<div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-neutral-700 transition-colors group-hover:bg-neutral-200">
						<BookOpenIcon className="size-4.5" />
					</div>

					<div className="min-w-0 flex-1">
						<div className="font-medium text-neutral-900 text-sm">Documentation</div>
						<div className="truncate text-neutral-500 text-xs">Guides & API reference</div>
					</div>

					<CaretRightIcon className="size-4 shrink-0 text-neutral-400" />
				</a>
			</SidebarFooter>
		</>
	)
}

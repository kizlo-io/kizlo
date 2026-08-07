import { useStore } from "@nanostores/react"
import { BookOpenIcon, CaretRightIcon, DiscordLogoIcon, GithubLogoIcon, type Icon, PlusIcon } from "@phosphor-icons/react"
import { useEffect, useState } from "react"
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
import { pageJumpLinks, useNav } from "@/shared/lib/nav"
import { $sidebar } from "@/shared/lib/store"
import type { NavBlock } from "@/shared/lib/types"
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

/** Resolve the drill stack that reveals the panel for the current route. */
function stackFor(blocks: NavBlock[], pathname: string): string[] {
	for (const block of blocks) {
		for (const node of block.items) {
			if (node.type === "page") {
				if (node.path === pathname) return pageJumpLinks(node).length > 0 ? [node.id] : []
				continue
			}

			if (node.onCreate === pathname) return [node.id]
			for (const page of node.items) {
				if (page.path === pathname) return pageJumpLinks(page).length > 0 ? [node.id, page.id] : [node.id]
			}
		}
	}

	return []
}

function Sidebar() {
	const blocks = useNav()
	const navigate = useNavigate()
	const { pathname, hash } = useLocation()

	const groups = blocks.flatMap((block) => block.items).filter((node) => node.type === "group")
	const pages = blocks.flatMap((block) => block.items).flatMap((node) => (node.type === "group" ? node.items : [node]))
	const drillablePages = pages.filter((page) => pageJumpLinks(page).length > 0)

	const [stack, setStack] = useState<string[]>(() => stackFor(blocks, pathname))

	// Auto-drill: landing on a page opens its section list. Re-runs when the nav
	// data arrives (settings load asynchronously) as well as on navigation.
	useEffect(() => {
		setStack(stackFor(blocks, pathname))
		$sidebar.set(false)
	}, [pathname, blocks])

	const back = () => setStack((current) => current.slice(0, -1))
	const closeDrawer = () => $sidebar.set(false)

	return (
		<>
			<SidebarHeader>
				<div className="p-3">
					<Logo />
				</div>

				<CommandTrigger />
			</SidebarHeader>

			<SidebarDrillDown>
				<SidebarPanel stack={stack}>
					{blocks.map((block) => (
						<SidebarSection key={block.label} label={block.label}>
							{block.items.map((node) => {
								if (node.type === "page") {
									return (
										<SidebarLink
											key={node.path}
											to={node.path}
											icon={resolveIcon(node.icon)}
											onClick={closeDrawer}
											trailing={pageJumpLinks(node).length > 0 ? <CaretRightIcon className="size-4 shrink-0 text-neutral-400" /> : null}
										>
											{node.name}
										</SidebarLink>
									)
								}

								const createPath = node.onCreate

								return (
									<div key={node.id} className="flex items-center gap-0.5">
										<SidebarButton
											className="flex-1"
											icon={resolveIcon(node.icon)}
											active={node.items.some((item) => item.path === pathname)}
											trailing={<CaretRightIcon className="size-4 shrink-0" />}
											onClick={() => setStack((current) => [...current, node.id])}
										>
											{node.name}
										</SidebarButton>

										{createPath ? (
											<button
												type="button"
												aria-label={`Add ${node.name}`}
												onClick={(event) => {
													event.stopPropagation()
													closeDrawer()
													navigate(createPath)
												}}
												className="flex size-8 shrink-0 cursor-pointer appearance-none items-center justify-center rounded-xs border-0 bg-transparent text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
											>
												<PlusIcon className="size-4" />
											</button>
										) : null}
									</div>
								)
							})}
						</SidebarSection>
					))}
				</SidebarPanel>

				{groups.map((group) => (
					<SidebarPanel key={group.id} panelId={group.id} stack={stack}>
						<SidebarBack onClick={back}>{group.name}</SidebarBack>

						{group.items.map((item) => (
							<SidebarLink
								key={item.path}
								to={item.path}
								icon={resolveIcon(item.icon)}
								onClick={closeDrawer}
								trailing={
									item.inactive ? (
										<SidebarBadge>Inactive</SidebarBadge>
									) : pageJumpLinks(item).length > 0 ? (
										<CaretRightIcon className="size-4 shrink-0 text-neutral-400" />
									) : null
								}
							>
								{item.name}
							</SidebarLink>
						))}
					</SidebarPanel>
				))}

				{drillablePages.map((page) => (
					<SidebarPanel key={page.id} panelId={page.id} stack={stack}>
						<SidebarBack onClick={back}>{page.name}</SidebarBack>

						{pageJumpLinks(page).map((link) => (
							<SidebarLink
								key={link.id}
								to={`${page.path}#${link.id}`}
								icon={resolveIcon(link.icon)}
								onClick={closeDrawer}
								active={pathname === page.path && hash === `#${link.id}`}
							>
								{link.name}
							</SidebarLink>
						))}
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

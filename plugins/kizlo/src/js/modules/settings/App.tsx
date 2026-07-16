import { useStore } from "@nanostores/react"
import { BookOpenIcon, CaretRightIcon, DiscordLogoIcon, GithubLogoIcon, type Icon } from "@phosphor-icons/react"
import { useEffect, useState } from "react"
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom"
import { Logo } from "@/modules/settings/shared/logo"
import { NotFound } from "@/modules/settings/shared/not-found"
import { CommandMenu, CommandTrigger } from "@/shared/components/command-menu"
import { ScrollToTop } from "@/shared/components/scroll-to-top"
import { Shell, ShellBody, ShellHeader, ShellMain, ShellSidebar } from "@/shared/components/shell"
import {
	SidebarBack,
	SidebarButton,
	SidebarDrillDown,
	SidebarFooter,
	SidebarHeader,
	SidebarLink,
	SidebarPanel,
	SidebarSection,
} from "@/shared/components/sidebar"
import { ComponentGallery } from "@/shared/components/ui/gallery"
import { useNav } from "@/shared/lib/settings"
import { $sidebar } from "@/shared/lib/store"
import { AuthorsSettingsPage } from "./general/authors"
import { BrandSettingsPage } from "./general/brand"
import { CrawlingSettingsPage } from "./general/crawling"
import { IdentitySettingsPage } from "./general/identity"
import { SiteSettingsPage } from "./general/site"
import { WebhookSettingsPage } from "./integration/webhook"
import { PostTypeSettingsPage } from "./post-type"
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
				<Route path="/post-types/:slug" element={<PostTypeSettingsPage />} />
				<Route path="/taxonomies/:slug" element={<TaxonomySettingsPage />} />
				<Route path="/integration/webhooks" element={<WebhookSettingsPage />} />

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
			<ScrollToTop />

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

function Sidebar() {
	const sections = useNav()
	const { pathname } = useLocation()
	const groups = sections.flatMap((section) => section.items).filter((node) => node.type === "group")

	const [active, setActive] = useState<string | null>(
		() => groups.find((group) => group.items.some((item) => item.path === pathname))?.id ?? null,
	)

	useEffect(() => {
		setActive(groups.find((group) => group.items.some((item) => item.path === pathname))?.id ?? null)
		$sidebar.set(false)
	}, [pathname])

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
				<SidebarPanel root active={active}>
					{sections.map((section) => (
						<SidebarSection key={section.label} label={section.label}>
							{section.items.map((node) =>
								node.type === "link" ? (
									<SidebarLink key={node.path} to={node.path} icon={node.icon} onClick={closeDrawer}>
										{node.name}
									</SidebarLink>
								) : (
									<SidebarButton
										key={node.id}
										icon={node.icon}
										active={node.items.some((item) => item.path === pathname)}
										trailing={<CaretRightIcon className="size-4 shrink-0" />}
										onClick={() => setActive(node.id)}
									>
										{node.name}
									</SidebarButton>
								),
							)}
						</SidebarSection>
					))}
				</SidebarPanel>

				{groups.map((group) => (
					<SidebarPanel key={group.id} id={group.id} active={active}>
						<SidebarBack onClick={() => setActive(null)}>{group.name}</SidebarBack>

						{group.items.map((item) => (
							<SidebarLink key={item.path} to={item.path} icon={item.icon} onClick={closeDrawer}>
								{item.name}
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

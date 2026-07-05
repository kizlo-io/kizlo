import { useStore } from "@nanostores/react"
import { BookOpenIcon, CaretRightIcon, DiscordLogoIcon, GithubLogoIcon, type Icon, SidebarSimpleIcon } from "@phosphor-icons/react"
import { useState } from "react"
import { Outlet, Route, Routes, useLocation } from "react-router-dom"
import { Logo } from "@/modules/settings/shared/logo"
import { NotFound } from "@/modules/settings/shared/not-found"
import { Shell, ShellBody, ShellHeader, ShellMain, ShellSidebar } from "@/shared/components/shell"
import { SidebarBack, SidebarButton, SidebarDrillDown, SidebarHeader, SidebarLink, SidebarPanel } from "@/shared/components/sidebar"
import { ComponentGallery } from "@/shared/components/ui/gallery"
import { useNav } from "@/shared/lib/settings"
import { $sidebar } from "@/shared/lib/store"
import { AuthorsSettingsPage } from "./general/authors"
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
				<Route index element={<SiteSettingsPage />} />
				<Route path="/general/site" element={<SiteSettingsPage />} />
				<Route path="/general/identity" element={<IdentitySettingsPage />} />
				<Route path="/general/authors" element={<AuthorsSettingsPage />} />
				<Route path="/general/crawling" element={<CrawlingSettingsPage />} />
				<Route path="/post-types/:slug" element={<PostTypeSettingsPage />} />
				<Route path="/taxonomies/:slug" element={<TaxonomySettingsPage />} />
				<Route path="/integration/webhooks" element={<WebhookSettingsPage />} />

				{/* Sandbox: component gallery preview. Secondary context (preflight still
				    applies here until Phase E) for chrome/specificity/layout checks. */}
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
			<ShellSidebar open={sidebarOpen} onClose={() => $sidebar.set(false)}>
				<Sidebar />
			</ShellSidebar>

			<ShellMain>
				{/* Placeholder: real title + actions land in the header step. */}
				<ShellHeader>
					<button
						type="button"
						aria-label="Open menu"
						onClick={() => $sidebar.set(true)}
						className="-ml-1.5 flex size-8 cursor-pointer appearance-none items-center justify-center rounded-md border-0 bg-transparent p-0 shadow-none hover:bg-neutral-100 md:hidden"
					>
						<SidebarSimpleIcon className="size-5" />
					</button>

					<span className="font-semibold text-neutral-900 text-sm">Header</span>

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
		</Shell>
	)
}

function Sidebar() {
	const nav = useNav()
	const { pathname } = useLocation()
	const groups = nav.filter((node) => node.type === "group")

	const [active, setActive] = useState<string | null>(
		() => groups.find((group) => group.items.some((item) => item.path === pathname))?.id ?? null,
	)

	const closeDrawer = () => $sidebar.set(false)

	return (
		<>
			<SidebarHeader>
				<Logo />
			</SidebarHeader>

			<SidebarDrillDown>
				<SidebarPanel root active={active}>
					{nav.map((node) =>
						node.type === "link" ? (
							<SidebarLink key={node.path} to={node.path} icon={node.icon} onClick={closeDrawer}>
								{node.name}
							</SidebarLink>
						) : (
							<SidebarButton
								key={node.id}
								icon={node.icon}
								trailing={<CaretRightIcon className="size-4 shrink-0" />}
								onClick={() => setActive(node.id)}
							>
								{node.name}
							</SidebarButton>
						),
					)}
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
		</>
	)
}

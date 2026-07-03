import { useStore } from "@nanostores/react"
import { BookOpenIcon, CaretRight, DiscordLogoIcon, GithubLogoIcon, TextAlignJustifyIcon } from "@phosphor-icons/react"
import type React from "react"
import { useState } from "react"
import { NavLink, Outlet, Route, Routes, useLocation, useMatch, useNavigate } from "react-router-dom"
import { Logo } from "@/modules/settings/shared/logo"
import { NotFound } from "@/modules/settings/shared/not-found"
import { useMenus } from "@/shared/lib/settings"
import { $sidebar } from "@/shared/lib/store"
import type { Menu, MenuItem } from "@/shared/lib/types"
import { cn } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/ui/collapsible"
import { TooltipProvider } from "@/shared/ui/tooltip"
import { AuthorsSettingsPage } from "./general/authors"
import { CrawlingSettingsPage } from "./general/crawling"
import { IdentitySettingsPage } from "./general/identity"
import { SiteSettingsPage } from "./general/site"
import { WebhookSettingsPage } from "./integration/webhook"
import { PostTypeSettingsPage } from "./post-type"
import { TaxonomySettingsPage } from "./taxonomy"

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

				<Route path="*" element={<NotFound />} />
			</Route>
		</Routes>
	)
}

function Layout({ ...props }: React.HTMLAttributes<HTMLElement>) {
	const menus = useMenus()

	return (
		<div data-slot="layout" className="[--admin-bar-height:32px] [--kizlo-header-height:56px]">
			<div className="relative flex">
				<Menus menus={menus} />

				<div className="w-full">
					<TooltipProvider>
						<Header />

						<Outlet />
					</TooltipProvider>
				</div>
			</div>
		</div>
	)
}

function Header({ ...props }: React.HTMLAttributes<HTMLElement>) {
	return (
		<header
			data-slot="layout-header"
			className={cn(
				"sticky top-0 left-0 z-9999 flex h-(--kizlo-header-height) w-full items-center border-border border-t border-b bg-card px-4 md:top-8 md:px-6",
			)}
		>
			<div className="grid w-full grid-cols-3 items-center gap-4">
				<div className="flex items-center gap-2">
					<Button variant={"outline"} onClick={() => $sidebar.set(true)} className="md:hidden">
						<TextAlignJustifyIcon />
					</Button>
				</div>

				<div />

				<div className="flex justify-end gap-1">
					<Button asChild variant="ghost" size="icon">
						<a href="https://kizlo.io/docs" target="_blank" rel="noreferrer" aria-label="Kizlo documentation">
							<BookOpenIcon className="size-5" />
							<span className="sr-only">Kizlo documentation</span>
						</a>
					</Button>

					<Button asChild variant="ghost" size="icon">
						<a href="https://discord.com/invite/MjAUZamx5g" target="_blank" rel="noreferrer" aria-label="Kizlo on Discord">
							<DiscordLogoIcon className="size-5" />
							<span className="sr-only">Kizlo on Discord</span>
						</a>
					</Button>

					<Button asChild variant="ghost" size="icon">
						<a href="https://github.com/kizlo-io/kizlo" target="_blank" rel="noreferrer" aria-label="Kizlo on GitHub">
							<GithubLogoIcon className="size-5" />
							<span className="sr-only">Kizlo on GitHub</span>
						</a>
					</Button>
				</div>
			</div>
		</header>
	)
}

interface MenusProps extends React.HTMLAttributes<HTMLElement> {
	menus: Menu[]
}

function Menus({ ...props }: MenusProps) {
	const isOpen = useStore($sidebar)

	return (
		<>
			<div
				className={cn("md:block! hidden h-full w-full max-w-60 border-r bg-card md:relative md:h-auto md:min-h-full md:pb-10", {
					"md:relative! fixed top-0 left-0 z-999999 block md:z-99": isOpen,
				})}
			>
				<div className="h-full space-y-1 overflow-y-auto md:sticky md:top-(--admin-bar-height) md:left-0 md:h-max">
					<div className="m-0 flex h-(--kizlo-header-height) items-center border-b pl-4">
						<Logo />
					</div>

					<div className="px-4 md:py-4">
						{props.menus.map((menu) => (
							<MenuGroup key={menu.name} menu={menu} />
						))}
					</div>
				</div>
			</div>

			{isOpen && (
				<button type="button" className="fixed inset-0 z-99999 h-full w-full bg-black/50 md:hidden" onClick={() => $sidebar.set(false)} />
			)}
		</>
	)
}

function MenuGroup({ ...props }: { menu: Menu }) {
	const nav = useNavigate()
	const location = useLocation()

	const firstMenu = props.menu.items[0]
	const isChildActive = props.menu.items.some((a) => a.path === location.pathname)
	const [open, setOpen] = useState(isChildActive)

	return (
		<Collapsible open={open && !isChildActive ? false : open} onOpenChange={setOpen} className="h-max space-y-1">
			<CollapsibleTrigger asChild>
				<Button
					variant="ghost"
					data-active={isChildActive}
					className="group w-full justify-start px-2! data-[active=true]:bg-accent data-[active=true]:text-foreground! data-[active=true]:hover:bg-accent"
					onClick={(e) => {
						if (!firstMenu || isChildActive) return
						nav(firstMenu.path)
						window.scrollTo({ top: 0, behavior: "smooth" })
						$sidebar.set(false)
					}}
					size={"lg"}
				>
					<props.menu.icon className="size-5" />
					{props.menu.name}

					<CaretRight
						className="z-10 ml-auto text-muted-foreground transition-transform group-data-[state=open]:rotate-90"
						onClick={(e) => {
							e.stopPropagation()
						}}
					/>
				</Button>
			</CollapsibleTrigger>

			<CollapsibleContent className="space-y-1 pb-3 pl-5">
				{props.menu.items.map((item) => (
					<MenuGroupItem key={item.name} item={item} />
				))}
			</CollapsibleContent>
		</Collapsible>
	)
}

interface MenuGroupItemProps extends React.HTMLAttributes<HTMLElement> {
	item: MenuItem
}

function MenuGroupItem({ ...props }: MenuGroupItemProps) {
	const isActive = useMatch(props.item.path)

	return (
		<Button
			asChild
			variant={"ghost"}
			data-active={!!isActive}
			className={cn(
				"group w-full justify-start text-muted-foreground! data-[active=true]:bg-accent/60 data-[active=false]:font-normal data-[active=true]:text-foreground! data-[active=true]:hover:bg-accent/60",
			)}
		>
			<NavLink
				to={props.item.path}
				onClick={() => {
					window.scrollTo({ top: 0, behavior: "smooth" })
					$sidebar.set(false)
				}}
			>
				{props.item.name}
			</NavLink>
		</Button>
	)
}

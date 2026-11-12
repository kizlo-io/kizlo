import { QueryClientProvider } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { Link, Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom"
import { Button } from "@/components/ui/button"
import type { ApiProblem } from "./api"
import type { Bootstrap } from "./bootstrap"
import { ErrorNotice } from "./ErrorNotice"
import { Icon } from "./Icon"
import { Products } from "./Products"
import { Sell } from "./Sell"
import { SaleCartProvider } from "./sale-cart"

export { ErrorNotice } from "./ErrorNotice"

import { createQueryClient } from "./query"
import { useTheme } from "./theme"

const placeholder = {
	sell: {
		title: "A space for your next sale.",
		description:
			"Your selling workspace is on its way. Product selection, barcode scanning, and the sale flow will arrive in a later update.",
		label: "Selling workspace",
	},
	orders: {
		title: "Every order, in one place.",
		description: "Order browsing and details are coming in a later update. You can continue managing orders in WordPress.",
		label: "Store orders",
	},
}

export function Placeholder({ screen }: { screen: keyof typeof placeholder }) {
	const content = placeholder[screen]
	return (
		<section className="pos-placeholder" aria-label={content.label}>
			<div className="pos-placeholder-icon">
				<Icon name={screen} />
			</div>
			<p className="pos-eyebrow">COMING NEXT</p>
			<h2>{content.title}</h2>
			<p>{content.description}</p>
			<span className="pos-status">
				<span className="pos-status-dot" /> Foundation ready
			</span>
		</section>
	)
}

export function Settings({ data }: { data: Bootstrap }) {
	return (
		<section className="pos-settings" aria-label="Store and account">
			<div>
				<p className="pos-eyebrow">YOUR WORKSPACE</p>
				<h2>
					A familiar store.
					<br />A focused workspace.
				</h2>
				<p>Connected to this WordPress store and your current account.</p>
			</div>
			<dl>
				<div>
					<dt>Store</dt>
					<dd>{data.store.name}</dd>
				</div>
				<div>
					<dt>Currency</dt>
					<dd>{data.store.currency}</dd>
				</div>
				<div>
					<dt>Signed in as</dt>
					<dd>{data.user.name}</dd>
				</div>
				<div>
					<dt>POS version</dt>
					<dd>{data.version}</dd>
				</div>
			</dl>
			<div className="pos-account-actions">
				<a href={data.urls.settings}>
					POS settings <Icon name="arrow" />
				</a>
				<a href={data.urls.account}>
					WordPress account <Icon name="arrow" />
				</a>
				<a href={data.urls.logout}>
					Log out of WordPress <Icon name="arrow" />
				</a>
				<p>Logging out ends your current WordPress session in this browser.</p>
			</div>
		</section>
	)
}

export default function App({ data }: { data: Bootstrap }) {
	const [client] = useState(createQueryClient)
	return (
		<QueryClientProvider client={client}>
			<SaleCartProvider key={`${data.restRoot}:${data.user.id}`} storageKey={`kizlo-pos:cart:${data.restRoot}:${data.user.id}`}>
				<Workspace data={data} />
			</SaleCartProvider>
		</QueryClientProvider>
	)
}

function Workspace({ data }: { data: Bootstrap }) {
	const [theme, toggleTheme] = useTheme()
	const [problem, setProblem] = useState<ApiProblem | null>(null)
	const location = useLocation()
	const current = data.navigation.find((item) => location.pathname === `/${item.id}` || location.pathname.startsWith(`/${item.id}/`)) ?? {
		id: "products",
		label: "Products",
	}
	const title = location.pathname === "/more" ? "More" : current.label
	const secondary = current.id === "orders" || current.id === "settings" || location.pathname === "/more"
	useEffect(() => {
		const receive = (event: Event) => setProblem((event as CustomEvent<ApiProblem>).detail)
		window.addEventListener("kizlo-pos-api-error", receive)
		return () => window.removeEventListener("kizlo-pos-api-error", receive)
	}, [])
	useEffect(() => {
		document.title = `${title} — ${data.store.name} — Kizlo POS`
		document.getElementById("pos-title")?.focus()
	}, [title, data.store.name])

	const link = (item: Bootstrap["navigation"][number]) => (
		<NavLink key={item.id} to={`/${item.id}`} className={({ isActive }) => (isActive ? "pos-nav-link is-active" : "pos-nav-link")}>
			<Icon name={item.id} />
			<span>{item.label}</span>
		</NavLink>
	)
	return (
		<div className="kizlo-pos-app" data-theme={theme}>
			<Button
				type="button"
				className="pos-skip"
				onClick={() => {
					document.getElementById("pos-main")?.focus()
				}}
			>
				Skip to content
			</Button>
			<aside className="pos-sidebar">
				<a className="pos-brand" href={data.urls.pos} aria-label="Kizlo POS home">
					<span className="pos-brand-mark">k</span>
					<span>
						Kizlo <strong>POS</strong>
					</span>
				</a>
				<div className="pos-store">
					<span className="pos-store-mark">{data.store.name.charAt(0).toUpperCase() || "K"}</span>
					<div>
						<strong>{data.store.name}</strong>
						<span>Your store workspace</span>
					</div>
				</div>
				<nav aria-label="Main navigation">
					<div className="pos-primary">{data.navigation.filter((item) => item.id === "products" || item.id === "sell").map(link)}</div>
					<div className="pos-secondary">{data.navigation.filter((item) => item.id === "orders" || item.id === "settings").map(link)}</div>
				</nav>
				<div className="pos-sidebar-footer">
					<span className="pos-avatar">{data.user.name.charAt(0).toUpperCase() || "U"}</span>
					<div>
						<strong>{data.user.name}</strong>
						<span>WordPress account</span>
					</div>
				</div>
			</aside>
			<div className="pos-workspace">
				<header className="pos-header">
					<div>
						<p className="pos-eyebrow">{data.store.name}</p>
						<h1 id="pos-title" tabIndex={-1}>
							{title}
						</h1>
					</div>
					<div className="pos-header-actions">
						<span className="pos-session">Store workspace</span>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="pos-theme-button"
							onClick={toggleTheme}
							aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
						>
							<Icon name={theme === "light" ? "moon" : "sun"} />
						</Button>
					</div>
				</header>
				<main id="pos-main" tabIndex={-1}>
					{problem && <ErrorNotice problem={problem} loginUrl={data.urls.login} />}
					<Routes>
						<Route path="/products/*" element={<Products theme={theme} onToggleTheme={toggleTheme} loginUrl={data.urls.login} />} />
						<Route path="/sell/*" element={<Sell theme={theme} onToggleTheme={toggleTheme} loginUrl={data.urls.login} />} />
						<Route path="/orders" element={<Placeholder screen="orders" />} />
						<Route path="/settings" element={<Settings data={data} />} />
						<Route
							path="/more"
							element={
								<section className="pos-more" aria-label="More destinations">
									<p className="pos-eyebrow">MORE FROM YOUR STORE</p>
									{data.navigation.filter((item) => item.id === "orders" || item.id === "settings").map(link)}
								</section>
							}
						/>
						<Route path="*" element={<Navigate to="/products" replace />} />
					</Routes>
					<footer className="pos-content-footer">
						<span>Built for the way you work.</span>
						<span>Kizlo POS · {data.version}</span>
					</footer>
				</main>
			</div>
			<nav className="pos-bottom-nav" aria-label="Phone navigation">
				{data.navigation.filter((item) => item.id === "products" || item.id === "sell").map(link)}
				<Link to="/more" className={secondary ? "pos-nav-link is-active" : "pos-nav-link"} aria-current={secondary ? "page" : undefined}>
					<Icon name="more" />
					<span>More</span>
				</Link>
			</nav>
		</div>
	)
}

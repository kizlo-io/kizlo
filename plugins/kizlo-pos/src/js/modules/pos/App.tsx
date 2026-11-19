import { QueryClientProvider } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { Navigate, Route, Routes } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ApiProblem } from "./api"
import type { Bootstrap } from "./bootstrap"
import { ErrorNotice } from "./ErrorNotice"
import { createQueryClient } from "./query"
import { SecurityLockScreen, SecurityProvider, UserSettings, useSecurity } from "./Security"
import { Sell } from "./Sell"
import { SaleCartProvider } from "./sale-cart"
import { useTheme } from "./theme"

export { ErrorNotice } from "./ErrorNotice"

export default function App({ data }: { data: Bootstrap }) {
	const [client] = useState(createQueryClient)
	return (
		<QueryClientProvider client={client}>
			<SecurityProvider data={data}>
				<SaleCartProvider key={`${data.restRoot}:${data.user.id}`} storageKey={`kizlo-pos:cart:${data.restRoot}:${data.user.id}`}>
					<Workspace data={data} />
				</SaleCartProvider>
			</SecurityProvider>
		</QueryClientProvider>
	)
}

function Workspace({ data }: { data: Bootstrap }) {
	const [theme, toggleTheme] = useTheme()
	const { status: security } = useSecurity()
	useEffect(() => {
		try {
			localStorage.removeItem("kizlo-pos:camera-prompt-seen")
		} catch {
			// Discard the obsolete startup hint when browser storage is available.
		}
	}, [])
	useEffect(() => {
		document.documentElement.dataset.posTheme = theme
		document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#111111" : "#f8f8f8")

		return () => document.documentElement.removeAttribute("data-pos-theme")
	}, [theme])
	const [problem, setProblem] = useState<ApiProblem | null>(null)
	useEffect(() => {
		const receive = (event: Event) => setProblem((event as CustomEvent<ApiProblem>).detail)
		window.addEventListener("kizlo-pos-api-error", receive)
		return () => window.removeEventListener("kizlo-pos-api-error", receive)
	}, [])
	useEffect(() => {
		document.title = `POS — ${data.store.name}`
	}, [data.store.name])
	const sellingScreen = (
		<Sell
			theme={theme}
			onToggleTheme={toggleTheme}
			loginUrl={data.urls.login}
			userName={data.user.name}
			storeName={data.store.name}
			accountUrl={data.urls.account}
		/>
	)
	return (
		<div
			className={cn(
				"kizlo-pos-app scheme-light data-[theme=dark]:scheme-dark min-h-dvh bg-canvas font-normal font-sans text-[15px]/normal text-foreground",
				"[--pos-bottom-nav-height:calc(72px+env(safe-area-inset-bottom))] [&_:focus-visible]:outline-2 [&_:focus-visible]:outline-primary",
				"[&_:focus-visible]:outline-offset-4 [&_a]:[-webkit-tap-highlight-color:transparent] [&_button]:cursor-pointer",
				"[&_button]:[-webkit-tap-highlight-color:transparent] [&_h1:focus]:outline-none [&_input:focus]:border-muted-foreground [&_input:focus]:shadow-none",
				"touch:[&_input:not([type=checkbox],[type=radio])]:text-base [&_input:not([type=radio],[type=checkbox]):focus]:outline-none [&_main:focus]:outline-none",
				"[&_select:focus]:border-muted-foreground [&_select:focus]:shadow-none [&_select:focus]:outline-none touch:[&_select]:text-base",
				"[&_textarea:focus]:border-muted-foreground [&_textarea:focus]:shadow-none [&_textarea:focus]:outline-none touch:[&_textarea]:text-base",
			)}
			data-theme={theme}
		>
			<Button
				type="button"
				className="pos-skip fixed -top-25 left-4 z-60 rounded-lg bg-foreground px-4.5 py-3 text-inverse! focus:top-4"
				onClick={() => document.getElementById("pos-main")?.focus()}
			>
				Skip to content
			</Button>
			<main
				id="pos-main"
				style={security.locked && security.configured ? { display: "none" } : undefined}
				inert={security.locked && security.configured}
				tabIndex={-1}
				className={cn(
					"flex min-h-dvh flex-col gap-3.5 mobile:gap-4 tablet:gap-5 wide:gap-7.5 bg-canvas compact:px-4 mobile:px-3 py-4 compact:pt-[calc(16px+env(safe-area-inset-top))] mobile:pt-[calc(12px+env(safe-area-inset-top))] pr-4 compact:pb-[calc(16px+var(--pos-bottom-nav-height))] mobile:pb-[calc(12px+var(--pos-bottom-nav-height))] pl-22",
					!security.configured && "pb-4! pl-4!",
				)}
			>
				{problem && <ErrorNotice problem={problem} loginUrl={data.urls.login} />}
				{!security.configured ? (
					<UserSettings accountUrl={data.urls.account} />
				) : (
					<Routes>
						<Route path="/sell" element={sellingScreen} />
						<Route path="/products" element={sellingScreen} />
						<Route path="/settings" element={sellingScreen} />
						<Route path="*" element={<Navigate to="/sell" replace />} />
					</Routes>
				)}
			</main>
			<SecurityLockScreen data={data} />
		</div>
	)
}

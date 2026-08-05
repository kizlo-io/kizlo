import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/solid-router"
import { createServerFn } from "@tanstack/solid-start"
import { resolveRootHead } from "kizlo/tanstack-start/server"
import { type JSX, Suspense } from "solid-js"
import { HydrationScript } from "solid-js/web"
import { client } from "@/lib/kizlo/server"

// Brand + site settings (icons, web manifest, theme color) come from WordPress — edit them in wp-admin,
// not here. Wrapped in a server function so the server-to-server client never reaches the browser bundle;
// TanStack merges the per-page SEO from child routes over these defaults.
const getRootHead = createServerFn({ method: "GET" }).handler(() => resolveRootHead(client))

export const Route = createRootRoute({
	loader: () => getRootHead(),
	head: ({ loaderData }) => ({
		meta: [{ charSet: "utf-8" }, { name: "viewport", content: "width=device-width, initial-scale=1" }, ...(loaderData?.meta ?? [])],
		links: loaderData?.links ?? [],
	}),
	component: RootComponent,
})

function RootComponent() {
	return (
		<RootDocument>
			<Outlet />
		</RootDocument>
	)
}

// Solid's SSR needs `HydrationScript` first in `<head>`; `HeadContent` (which emits the collected
// meta/links) and `Scripts` sit in `<body>` — the layout TanStack Start's Solid runtime expects, and
// where it hoists the head tags from during SSR.
function RootDocument({ children }: Readonly<{ children: JSX.Element }>) {
	return (
		<html lang="en">
			<head>
				<HydrationScript />
			</head>
			<body>
				<HeadContent />
				<Suspense>{children}</Suspense>
				<Scripts />
			</body>
		</html>
	)
}

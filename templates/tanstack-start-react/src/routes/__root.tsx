import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { resolveRootHead } from "kizlo/tanstack-start/server"
import type { ReactNode } from "react"
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

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<Scripts />
			</body>
		</html>
	)
}

import { createRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"

export function getRouter() {
	return createRouter({
		routeTree,
		scrollRestoration: true,
	})
}

// Registers the router type so loaders, params, and server-function payloads are fully typed app-wide.
declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>
	}
}

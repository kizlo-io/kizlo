"use client"

/**
 * The app's browser Kizlo client, made available to every client component below it.
 *
 * Configuration, not state: the provider holds one value the app already owns. It imports nothing but React, so no
 * framework integration and no data library is pulled in behind it.
 *
 * Server components cannot read React context, so they keep taking the client as a prop.
 */

import { createContext, type ReactNode, useContext, useMemo } from "react"
import type { ActiveKizloClient } from "./client"

/**
 * What the context carries. One key today, which is why the hook hands back the object rather than the client itself: a
 * locale, a session or app-wide configuration can join it without changing a signature.
 */
export type KizloContextValue = {
	/** The app's browser Kizlo client, typed from its generated browser endpoints. */
	client: ActiveKizloClient
}

const KizloContext = createContext<KizloContextValue | null>(null)

export type KizloProviderProps = {
	children: ReactNode
	/** The app's browser Kizlo client, the direct API client. */
	client: ActiveKizloClient
}

/**
 * Holds the app's browser Kizlo client for the client components below it. Mount it once, above anything that reads it.
 *
 * @example
 * ```tsx
 * // app/providers.tsx
 * "use client"
 * import { KizloProvider } from "kizlo/react"
 * import { client } from "@/lib/kizlo/client"
 *
 * export function Providers({ children }: { children: React.ReactNode }) {
 * 	return <KizloProvider client={client}>{children}</KizloProvider>
 * }
 * ```
 */
export function KizloProvider({ children, client }: KizloProviderProps) {
	if (!client) {
		throw new Error("<KizloProvider client={client}> needs the browser client `createKizloClient` returned.")
	}

	// Keyed on the client alone, so the value's identity survives every re-render of the app's provider tree.
	const value = useMemo<KizloContextValue>(() => ({ client }), [client])

	return <KizloContext.Provider value={value}>{children}</KizloContext.Provider>
}

/**
 * Reads the context, whose `client` is typed from its generated browser endpoints, so a call the generated API does not
 * carry is a compile error rather than a runtime surprise.
 *
 * @example
 * ```tsx
 * "use client"
 * import { useKizloContext } from "kizlo/react"
 *
 * function LatestPosts() {
 * 	const { client } = useKizloContext()
 * 	// ...
 * }
 * ```
 */
export function useKizloContext(): KizloContextValue {
	const value = useContext(KizloContext)

	if (!value) {
		throw new Error("mount <KizloProvider client={client}> from kizlo/react above this component.")
	}

	return value
}

import { createRootMetadata, createRootViewport } from "kizlo/nextjs/server"
import type { ReactNode } from "react"
import { client } from "@/lib/kizlo/server"

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	)
}

export const generateMetadata = createRootMetadata(client)
export const generateViewport = createRootViewport(client)

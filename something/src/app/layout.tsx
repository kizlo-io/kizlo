import { createRootMetadata, createRootViewport } from "kizlo/nextjs/server"
import type { ReactNode } from "react"
import { client } from "@/lib/kizlo/server"
import "./globals.css"

// Title, icons, web manifest, and metadataBase come from your WordPress brand + site settings —
// edit them in wp-admin, not here. createRootMetadata reads them through your typed Kizlo client.
export const generateMetadata = createRootMetadata(client)

// <meta name="theme-color"> for the mobile browser chrome, from your brand theme color.
export const generateViewport = createRootViewport(client)

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	)
}

import "./global.css"
import { RootProvider } from "fumadocs-ui/provider/next"
import type { Metadata } from "next"
import { Geist } from "next/font/google"
import { createMetadata } from "@/lib/metadata"
import { appName, siteUrl } from "@/lib/shared"
import { cn } from "@/lib/utils"

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" })

export const metadata: Metadata = {
	...createMetadata(),
	metadataBase: new URL(siteUrl),
	title: {
		default: `${appName} — The toolkit for headless WordPress`,
		template: `%s | ${appName}`,
	},
	applicationName: appName,
	keywords: ["headless WordPress", "WordPress toolkit", "WordPress REST API", "WooCommerce", "TypeScript", "Next.js"],
	icons: {
		icon: [
			{ url: "/favicon-light.ico", media: "(prefers-color-scheme: light)" },
			{ url: "/favicon-dark.ico", media: "(prefers-color-scheme: dark)" },
		],
	},
}

export default function Layout({ children }: LayoutProps<"/">) {
	return (
		<html lang="en" className={cn(geist.variable, "font-sans antialiased")} suppressHydrationWarning>
			<body className="flex min-h-screen flex-col">
				<RootProvider>{children}</RootProvider>
			</body>
		</html>
	)
}

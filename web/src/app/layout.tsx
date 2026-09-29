import "./global.css"
import { GoogleAnalytics } from "@next/third-parties/google"
import { RootProvider } from "fumadocs-ui/provider/next"
import { createRootMetadata, createRootViewport } from "kizlo/nextjs/server"
import { Geist } from "next/font/google"
import { client } from "@/lib/kizlo/server"
import { cn } from "@/lib/utils"

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" })

// Unset in local development and in any preview that has no property of its own, where loading
// gtag.js would only send hits nobody reads.
const gaId = process.env.NEXT_PUBLIC_GA_ID

export const generateMetadata = createRootMetadata(client)
export const generateViewport = createRootViewport(client)

export default function Layout({ children }: LayoutProps<"/">) {
	return (
		<html lang="en" className={cn(geist.variable, "font-sans antialiased")} suppressHydrationWarning>
			<body className="flex min-h-screen flex-col" suppressHydrationWarning>
				<RootProvider>{children}</RootProvider>
				{gaId ? <GoogleAnalytics gaId={gaId} /> : null}
			</body>
		</html>
	)
}

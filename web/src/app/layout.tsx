import "./global.css"
import { RootProvider } from "fumadocs-ui/provider/next"
import { createRootMetadata, createRootViewport } from "kizlo/nextjs/server"
import { Geist } from "next/font/google"
import { client } from "@/lib/kizlo/server"
import { cn } from "@/lib/utils"

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" })

export const generateMetadata = createRootMetadata(client)
export const generateViewport = createRootViewport(client)

export default function Layout({ children }: LayoutProps<"/">) {
	return (
		<html lang="en" className={cn(geist.variable, "font-sans antialiased")} suppressHydrationWarning>
			<body className="flex min-h-screen flex-col">
				<RootProvider>{children}</RootProvider>
			</body>
		</html>
	)
}

import "./global.css"
import { RootProvider } from "fumadocs-ui/provider/next"
import { Geist } from "next/font/google"
import { cn } from "@/lib/utils"

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" })

export default function Layout({ children }: LayoutProps<"/">) {
	return (
		<html lang="en" className={cn(geist.variable, "font-sans antialiased")} suppressHydrationWarning>
			<body className="flex min-h-screen flex-col">
				<RootProvider>{children}</RootProvider>
			</body>
		</html>
	)
}

import Link from "next/link"
import { appName, docsRoute } from "@/lib/shared"

export default function IntegrationsLayout({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex min-h-dvh flex-col">
			<header className="sticky top-0 z-10 border-fd-border border-b bg-fd-background/80 backdrop-blur">
				<div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
					<Link href="/" className="flex items-center gap-2 font-semibold text-fd-foreground">
						<img src="https://cdn.kizlo.io/logo/icon-light.svg" alt={appName} className="hidden h-6 w-6 dark:block" />
						<img src="https://cdn.kizlo.io/logo/icon-dark.svg" alt={appName} className="h-6 w-6 dark:hidden" />
						<span>{appName}</span>
					</Link>

					<Link href={docsRoute} className="font-medium text-fd-muted-foreground text-sm transition-colors hover:text-fd-foreground">
						Documentation
					</Link>
				</div>
			</header>

			{children}
		</div>
	)
}

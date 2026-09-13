import Link from "next/link"
import { Button } from "@/components/ui/button"
import { gitConfig, socials } from "@/lib/shared"

export const repositoryUrl = `https://github.com/${gitConfig.user}/${gitConfig.repo}`

export function HomeNavigation() {
	return (
		<header className="flex flex-wrap items-center justify-between gap-4 border-border border-b px-6 py-5 sm:px-10 lg:px-16">
			<Link href="/" aria-label="Kizlo home" className="flex items-center gap-2.5 font-semibold text-xl tracking-tight">
				<img src="https://cdn.kizlo.io/logo/icon-light.svg" alt="" width={28} height={28} />
				<span className="hidden sm:inline">Kizlo</span>
			</Link>
			<nav aria-label="Main navigation" className="flex items-center gap-4 text-sm sm:gap-7">
				<Link className="hover:underline" href="/docs">
					Docs
				</Link>
				<Link className="hover:underline" href={repositoryUrl}>
					GitHub
				</Link>
				<Button asChild className="h-10 px-3 text-sm sm:px-4">
					<Link href="/#start">Start building</Link>
				</Button>
			</nav>
		</header>
	)
}

export function HomeFooter() {
	return (
		<footer className="flex flex-wrap items-center justify-between gap-6 border-border border-t px-6 py-8 text-muted-foreground text-xs sm:px-10 lg:px-16">
			<Link href="/" className="font-semibold text-base text-foreground">
				<span className="hidden sm:inline">Kizlo</span>
			</Link>
			<nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-4">
				<Link href="/docs">Docs</Link>
				{socials.map((social) => (
					<Link key={social.label} href={social.label === "GitHub" ? repositoryUrl : social.href}>
						{social.label}
					</Link>
				))}
			</nav>
			<span>Open source. Built for your WordPress.</span>
		</footer>
	)
}

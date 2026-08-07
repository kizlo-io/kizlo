import { cn } from "@/lib/utils"
import { Container, Wrapper } from "./layout"

type Feature = {
	id: string
	title: string
	description: string
	cols: string
	visual: React.ReactNode
}

export const FEATURES: Feature[] = [
	{
		id: "two-teams",
		title: "Your content and dev teams stop blocking each other",
		description: "Editors publish in WordPress, developers own the frontend. A copy change stops being a pull request and a deploy.",
		cols: "md:col-span-3",
		visual: (
			<div className="flex items-center gap-3 text-xs">
				<Chip>Content team</Chip>
				<span className="text-neutral-600">→ WordPress</span>
				<span className="text-neutral-600">·</span>
				<Chip>Engineering</Chip>
				<span className="text-neutral-600">→ frontend</span>
			</div>
		),
	},
	{
		id: "seo-included",
		title: "SEO ships with the site, you don't build it",
		description: "Structured data, social previews, sitemaps, robots, and metadata are generated automatically from WordPress settings.",
		cols: "md:col-span-3",
		visual: (
			<div className="flex flex-wrap gap-2">
				{["<meta>", "JSON-LD", "sitemap.xml", "robots.txt", "manifest"].map((tag) => (
					<Chip key={tag} mono>
						{tag}
					</Chip>
				))}
			</div>
		),
	},
	{
		id: "type-safe",
		title: "Catch mistakes before they ship",
		description:
			"Kizlo is typed end to end, from your content to the APIs you build. Autocomplete guides every call, and mismatches surface at build time instead of as a white screen after deploy.",
		cols: "md:col-span-2",
		visual: (
			<div className="w-full border border-neutral-800 bg-neutral-950 p-3 font-mono text-neutral-400 text-xs">
				<span className="text-neutral-500">page.</span>
				<span className="text-emerald-300">title</span>
				<span className="ml-0.5 inline-block h-3.5 w-px translate-y-0.5 bg-neutral-500" />
			</div>
		),
	},
	{
		id: "framework-freedom",
		title: "Build with the framework you already use",
		description: "Next.js, Astro, and TanStack Start today, with more on the way. No new rendering model, no migration.",
		cols: "md:col-span-2",
		visual: (
			<div className="flex flex-wrap gap-2">
				{["Next.js", "Astro", "TanStack Start"].map((fw) => (
					<Chip key={fw}>{fw}</Chip>
				))}
				<Chip>+ more coming</Chip>
			</div>
		),
	},
	{
		id: "local-wordpress",
		title: "A real WordPress on your machine in one command",
		description:
			"The CLI runs WordPress in Docker, seeded and ready, then tears it down. Develop and test offline with no shared staging to fight over.",
		cols: "md:col-span-2",
		visual: (
			<div className="w-full border border-neutral-800 bg-neutral-950 p-3 font-mono text-xs">
				<span className="select-none text-neutral-600">$ </span>
				<span className="text-neutral-300">npx kizlo dev</span>
			</div>
		),
	},
	{
		id: "no-lock-in",
		title: "Grow without swapping your stack",
		description:
			"Add commerce and forms through extensions; plug in your own auth, logging, and services through adapters. Kizlo owns the content layer and stays out of your database, auth, and billing.",
		cols: "md:col-span-6",
		visual: (
			<div className="flex flex-wrap items-center gap-3 text-xs">
				<Chip>WooCommerce</Chip>
				<Chip>Contact Form 7</Chip>
				<span className="text-neutral-600">auth · DB · billing → yours</span>
			</div>
		),
	},
]

export function Features() {
	return (
		<Container theme="light">
			<Wrapper border="top" className="px-6 py-16 text-center sm:px-8">
				<p className="text-neutral-500 text-xs uppercase tracking-widest">Why Kizlo</p>
				<h2 className="mx-auto mt-4 max-w-2xl text-balance text-3xl tracking-tight sm:text-4xl">
					Everything a content-driven app needs, wired in from the start.
				</h2>
			</Wrapper>

			<Wrapper border="top" className="grid grid-cols-1 gap-px bg-neutral-200 md:grid-cols-6" ticks>
				{FEATURES.map((feature) => (
					<div key={feature.id} className={cn("flex flex-col bg-white p-8 sm:p-10", feature.cols)}>
						<h3 className="text-balance text-xl tracking-tight sm:text-2xl">{feature.title}</h3>
						<p className="mt-3 max-w-md text-neutral-600 text-sm leading-relaxed sm:text-base">{feature.description}</p>

						<div className="mt-8 flex flex-1 items-end">{feature.visual}</div>
					</div>
				))}
			</Wrapper>
		</Container>
	)
}

function Chip({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
	return (
		<span className={cn("inline-flex items-center border border-neutral-300 px-2.5 py-1 text-neutral-700 text-xs", mono && "font-mono")}>
			{children}
		</span>
	)
}

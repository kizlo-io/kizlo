import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { Container, Wrapper } from "./layout"

const PARTS = [
	{
		index: "01",
		title: "The WordPress plugin",
		description: "Turns WordPress into a secure, frontend-ready content and SEO source built to work with Kizlo.",
		features: [
			"Content, menus, identity, brand, and SEO settings",
			"Headless routing, previews, and security controls",
			"Two-way events when content changes",
		],
		href: "/wordpress-plugin",
		link: "Explore the WordPress plugin",
	},
	{
		index: "02",
		title: "The TypeScript framework",
		description: "Brings everything managed in WordPress into the frontend framework and runtime you already use.",
		features: [
			"Typed client and server APIs with autocomplete",
			"Metadata, structured data, sitemaps, and robots",
			"Local WordPress, fixtures, and testing from the CLI",
		],
		href: "/framework",
		link: "Explore the TypeScript framework",
	},
] as const

export function KizloSystem() {
	return (
		<Container theme="light">
			<Wrapper border="top" className="grid gap-8 px-6 py-16 sm:px-10 lg:grid-cols-[1fr_1.25fr] lg:px-12 lg:py-24" ticks>
				<div>
					<p className="text-neutral-500 text-xs uppercase tracking-widest">What Kizlo is</p>
					<h2 className="mt-4 max-w-lg text-balance text-3xl tracking-tight sm:text-4xl">Two parts. One content system.</h2>
				</div>

				<p className="max-w-2xl text-balance text-neutral-600 leading-relaxed sm:text-lg">
					The plugin and framework solve different sides of the same problem. One prepares WordPress for a headless frontend; the other
					makes that WordPress data feel native in TypeScript. Kizlo is the connection between them.
				</p>
			</Wrapper>

			<Wrapper border="top-bottom" className="relative grid lg:grid-cols-2" ticks>
				{PARTS.map((part) => (
					<article
						key={part.title}
						className="group flex min-h-128 flex-col border-neutral-200 border-b p-6 last:border-b-0 sm:p-10 lg:border-r lg:border-b-0 lg:p-12 lg:last:border-r-0"
					>
						<div className="flex items-center justify-between border-neutral-200 border-b pb-5">
							<span className="font-mono text-neutral-400 text-xs">{part.index}</span>
							<span className="size-2 bg-[#0066ff]" />
						</div>

						<h3 className="mt-10 text-balance text-2xl tracking-tight sm:text-3xl">{part.title}</h3>
						<p className="mt-4 max-w-lg text-neutral-600 leading-relaxed">{part.description}</p>

						<ul className="mt-10 space-y-4">
							{part.features.map((feature) => (
								<li key={feature} className="flex gap-3 text-neutral-700 text-sm leading-relaxed sm:text-base">
									<span className="mt-2 size-1.5 shrink-0 bg-[#0066ff]" />
									<span>{feature}</span>
								</li>
							))}
						</ul>

						<Link href={part.href} className="mt-auto flex items-center gap-2 pt-12 font-medium text-sm">
							{part.link}
							<ArrowRightIcon className="transition-transform duration-200 group-hover:translate-x-1" />
						</Link>
					</article>
				))}
			</Wrapper>
		</Container>
	)
}

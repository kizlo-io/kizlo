import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { Command } from "@/components/command"
import { brandIcons } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { conceptImages } from "./concept-images"
import { FeatureRow, Section, TextLink } from "./layout"
import { VisualSlot } from "./visual-slot"

type PreviewProps = { showBriefs: boolean }

export function Introduction({ showBriefs }: PreviewProps) {
	return (
		<Section aria-labelledby="introduction-heading" className="border-t-0 pt-16 text-center lg:pt-24">
			<h1
				id="introduction-heading"
				className="mx-auto max-w-5xl text-balance font-medium text-[2.5rem] leading-[1.08] tracking-tight sm:text-[3.5rem] lg:text-[4rem]"
			>
				Your WordPress.
				<br />
				<span className="text-muted-foreground">Now speaking</span> TypeScript.
			</h1>
			<p className="home-copy mx-auto mt-8 max-w-2xl">
				Kizlo is an open-source TypeScript framework for headless WordPress. Connect your content to your frontend with typed APIs, while
				your team keeps managing content in WordPress.
			</p>
			<div className="mt-8 flex flex-wrap items-center justify-center gap-6">
				<Button asChild className="h-12 gap-4 px-5 text-sm">
					<Link href="/#start">
						Start building
						<ArrowRightIcon aria-hidden="true" />
					</Link>
				</Button>
				<TextLink href="/#types">See how the types work</TextLink>
			</div>
			<p className="mt-5 text-muted-foreground text-xs">Quickstarts for Next.js, Astro, and TanStack Start.</p>
			<div className="mt-12 border-border border-t pt-6 lg:mt-16">
				<p className="mx-auto max-w-xl text-muted-foreground text-sm leading-relaxed">
					Install Kizlo in WordPress and your app. WordPress manages content; your app serves the frontend.
				</p>
				<VisualSlot
					showBrief={showBriefs}
					title="Where Kizlo fits"
					concept={conceptImages.architecture}
					medium="Diagram"
					instructions="WordPress + Kizlo plugin → Kizlo in the app → frontend."
					takeaway="Show where Kizlo fits between your content and the frontend you build."
					className="mt-6"
				/>
			</div>
		</Section>
	)
}

export function TypesStory({ showBriefs }: PreviewProps) {
	return (
		<Section id="types" aria-labelledby="types-heading">
			<div className="grid items-start gap-6 lg:grid-cols-2 lg:gap-16">
				<h2 id="types-heading" className="home-heading">
					Your WordPress content. Typed in your app.
				</h2>
				<p className="home-copy">
					Kizlo generates TypeScript definitions from the routes, schemas, and configured fields your WordPress site publishes. Get
					autocomplete for your content and type checks for your API calls.
				</p>
			</div>
			<VisualSlot
				showBrief={showBriefs}
				title="Types from your content"
				concept={conceptImages.types}
				medium="Image or animation"
				instructions="Configure a required text field, company_name, for Posts in WordPress. Show generation, then post.custom.company_name as a string with editor autocomplete."
				takeaway="The type comes from the field configured in WordPress, rather than a hand-written interface. Frame the sequence as configuration → generation → typed application code."
				className="mt-10"
			/>
			<p className="mt-8 max-w-2xl text-sm leading-relaxed">
				Configure the field in WordPress, regenerate, and use it with its generated type. No hand-written interface for this field.
			</p>
			<div className="mt-4 flex flex-wrap items-end justify-between gap-6">
				<p className="max-w-xl text-muted-foreground text-sm leading-relaxed">
					Kizlo calls this WordPress introspection. Your app's procedures define which calls reach the frontend.
				</p>
				<TextLink href="/docs/concepts/introspection">How type generation works</TextLink>
			</div>
		</Section>
	)
}

export function WorkflowStory({ showBriefs }: PreviewProps) {
	return (
		<Section id="workflow" aria-labelledby="workflow-heading">
			<h2 id="workflow-heading" className="home-heading mb-10 max-w-2xl">
				From editing content to testing your app.
			</h2>
			<FeatureRow
				visual={
					<VisualSlot
						showBrief={showBriefs}
						title="Publishing"
						concept={conceptImages.publishing}
						medium="Image or short video"
						instructions="Show WordPress preview opening the matching page on the frontend. An optional crop can show the SEO controls."
						takeaway="Editors keep their WordPress workflow while seeing changes in the frontend."
					/>
				}
			>
				<h3 className="home-subheading">Publish from WordPress</h3>
				<p className="home-copy mt-4">
					Keep editing in WordPress. Preview changes on your frontend and manage page titles, descriptions, and social metadata alongside
					your content.
				</p>
				<TextLink className="mt-6" href="/docs/concepts/plugin">
					Meet the WordPress plugin
				</TextLink>
			</FeatureRow>
			<FeatureRow
				visual={
					<VisualSlot
						showBrief={showBriefs}
						title="Development / testing"
						concept={conceptImages.development}
						medium="Terminal or coded visual"
						instructions="Place separate dev and test WordPress environments beside npx kizlo dev and npx kizlo test."
						takeaway="Make the separate data environments clear: development content and test fixtures stay apart."
					/>
				}
			>
				<h3 className="home-subheading">Develop and test with real WordPress</h3>
				<p className="home-copy mt-4">
					Run WordPress locally with Docker, seed content for your project, and run your tests against a separate WordPress environment.
					Keep development and test data apart.
				</p>
				<TextLink className="mt-6" href="/docs/concepts/development-and-testing">
					See development and testing
				</TextLink>
			</FeatureRow>
			<p className="text-muted-foreground text-xs leading-relaxed">
				Local WordPress requires Docker. You can also connect an existing WordPress site.
			</p>
		</Section>
	)
}

const capabilities = [
	{
		title: "Content",
		summary: "Posts, pages, taxonomies, menus, and configured custom fields.",
		href: "/docs/concepts/custom-fields",
		link: "Explore content fields",
	},
	{
		title: "Application logic",
		summary: "Custom API procedures, middleware, schema validation, and typed errors.",
		href: "/docs/concepts/integration#procedures",
		link: "Explore procedures",
	},
	{
		title: "Content events",
		summary: "React to WordPress changes with typed events. Next.js integration includes cache revalidation.",
		href: "/docs/concepts/integration#events",
		link: "Explore events",
	},
]

export function Capabilities() {
	return (
		<Section id="capabilities" aria-labelledby="capabilities-heading">
			<h2 id="capabilities-heading" className="home-heading max-w-2xl">
				More tools for the app you're building.
			</h2>
			<p className="home-copy mt-6">Start with content. Add the capabilities your project needs.</p>
			<div className="mt-10">
				{capabilities.map((capability) => (
					<div key={capability.title} className="grid gap-4 border-border border-t py-7 md:grid-cols-3 md:gap-10">
						<h3 className="font-medium text-xl">{capability.title}</h3>
						<div className="md:col-span-2">
							<p className="text-muted-foreground leading-relaxed">{capability.summary}</p>
							<TextLink className="mt-3" href={capability.href}>
								{capability.link}
							</TextLink>
						</div>
					</div>
				))}
				<div className="grid gap-4 border-border border-y py-7 md:grid-cols-3 md:gap-10">
					<h3 className="font-medium text-xl">Integrations and services</h3>
					<div className="md:col-span-2">
						<p className="text-muted-foreground leading-relaxed">
							WooCommerce for products, carts, checkout, customers, and orders. Contact Form 7 for typed submissions. Clerk for sessions and
							optional WordPress user synchronization.
						</p>
						<p className="mt-3 text-muted-foreground text-xs leading-relaxed">
							WooCommerce and Contact Form 7 require companion plugins. Contact Form 7 also needs an app-defined field schema.
						</p>
						<div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
							<TextLink href="/docs/concepts/integration#prebuilt-integrations">Explore integrations</TextLink>
							<TextLink href="/docs/concepts/adapter">Explore service adapters</TextLink>
						</div>
					</div>
				</div>
			</div>
		</Section>
	)
}

const frameworks = [
	{ name: "Next.js", label: "React", href: "/docs/quickstarts/nextjs", Icon: brandIcons.NextJs },
	{ name: "Astro", label: "Content-first", href: "/docs/quickstarts/astro", Icon: brandIcons.Astro },
	{ name: "TanStack Start", label: "React", href: "/docs/quickstarts/tanstack-start/react", Icon: brandIcons.React },
	{ name: "TanStack Start", label: "Solid", href: "/docs/quickstarts/tanstack-start/solid", Icon: brandIcons.SolidStart },
]

export function Quickstarts() {
	return (
		<Section id="start" aria-labelledby="start-heading" className="home-highlight">
			<h2 id="start-heading" className="home-heading max-w-2xl">
				Build your first page with Kizlo.
			</h2>
			<p className="home-copy mt-6 max-w-xl">
				Choose your frontend and follow the quickstart. Start a new project or connect Kizlo to an app you already have.
			</p>
			<div className="mt-10 grid grid-cols-1 border-border border-t border-l sm:grid-cols-2 lg:grid-cols-4">
				{frameworks.map(({ name, label, href, Icon }) => (
					<Link key={href} href={href} className="group flex min-w-0 flex-col gap-7 border-border border-r border-b p-6 hover:bg-muted">
						<div className="flex items-center justify-between">
							<Icon aria-hidden="true" className="size-7" />
							<ArrowRightIcon aria-hidden="true" className="size-5" />
						</div>
						<div>
							<span className="block font-medium text-lg">{name}</span>
							<span className="mt-1 block text-muted-foreground text-sm">{label}</span>
						</div>
					</Link>
				))}
			</div>
			<div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
				<Command command="npx kizlo@latest create" />
				<p className="text-muted-foreground text-xs">Prefer the CLI? Choose your framework interactively.</p>
			</div>
			<p className="mt-8 max-w-xl text-muted-foreground text-xs leading-relaxed">
				Use Node.js 22.14 or later. Run WordPress locally with Docker, or connect an existing site with the Kizlo plugin.
			</p>
			<TextLink className="mt-5" href="/docs/installation#quickstarts">
				Add Kizlo to an existing app
			</TextLink>
		</Section>
	)
}

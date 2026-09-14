import Link from "next/link"
import { notFound } from "next/navigation"
import { Command } from "@/components/command"
import { DownloadButton } from "@/components/download-button"
import type { Integration } from "@/lib/kizlo/integrations"
import { client } from "@/lib/kizlo/server"
import { createMetadata } from "@/lib/metadata"
import { getLatestRelease, isPluginSlug } from "@/lib/plugins"
import { gitConfig } from "@/lib/shared"

const TYPE_LABELS = {
	package: "Package",
	plugin: "Plugin",
	both: "Package + Plugin",
} as const

export async function generateStaticParams() {
	const { data } = await client.integrations.list()
	return (data ?? []).map((integration) => ({ slug: integration.slug }))
}

async function getIntegration(slug: string): Promise<Integration | null> {
	const { data, error } = await client.integrations.get({ params: { identifier: slug } })
	if (error) return null
	return data
}

export async function generateMetadata(props: PageProps<"/integrations/[slug]">) {
	const { slug } = await props.params
	const integration = await getIntegration(slug)
	if (!integration) return createMetadata({ alternates: { canonical: "/integrations" } })
	return createMetadata({
		title: integration.name,
		description: integration.description || `Connect ${integration.name} with Kizlo.`,
		alternates: { canonical: `/integrations/${integration.slug}` },
	})
}

/** A prefilled GitHub new-issue form scoped to this integration. */
function reportIssueUrl(integration: Integration): string {
	const params = new URLSearchParams({
		title: `[${integration.name}] `,
		labels: "bug",
		body: `**Integration:** ${integration.name}\n\n**What happened?**\n\n**Steps to reproduce**\n\n**Expected behaviour**\n`,
	})
	return `https://github.com/${gitConfig.user}/${gitConfig.repo}/issues/new?${params.toString()}`
}

export default async function IntegrationPage(props: PageProps<"/integrations/[slug]">) {
	const { slug } = await props.params
	const integration = await getIntegration(slug)
	if (!integration) notFound()

	const hasPackage = integration.type === "package" || integration.type === "both"
	const hasPlugin = integration.type === "plugin" || integration.type === "both"
	const pluginSlug = integration.pluginSlug && isPluginSlug(integration.pluginSlug) ? integration.pluginSlug : null
	const release = pluginSlug ? await getLatestRelease(pluginSlug) : null

	return (
		<main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
			<Link href="/integrations" className="text-fd-muted-foreground text-sm transition-colors hover:text-fd-foreground">
				← All integrations
			</Link>

			<div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_20rem] lg:gap-14">
				<div className="min-w-0">
					<header className="flex items-start gap-4">
						{integration.logoUrl ? (
							<img src={integration.logoUrl} alt={integration.logoAlt ?? ""} className="h-14 w-14 shrink-0 rounded-lg object-contain" />
						) : (
							<div
								aria-hidden
								className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-fd-muted font-semibold text-fd-muted-foreground text-xl"
							>
								{integration.name.charAt(0)}
							</div>
						)}
						<div className="min-w-0">
							<h1 className="font-semibold text-3xl text-fd-foreground tracking-tight">{integration.name}</h1>
							<div className="mt-2 flex flex-wrap items-center gap-2">
								{integration.type && (
									<span className="rounded-full border border-fd-border px-2.5 py-0.5 font-medium text-fd-muted-foreground text-xs">
										{TYPE_LABELS[integration.type]}
									</span>
								)}
								{integration.categories.map((category) => (
									<span key={category.slug} className="rounded-full bg-fd-muted px-2.5 py-0.5 font-medium text-fd-muted-foreground text-xs">
										{category.name}
									</span>
								))}
							</div>
						</div>
					</header>

					{integration.content && <div className="prose mt-8" dangerouslySetInnerHTML={{ __html: integration.content }} />}
				</div>

				<aside className="lg:sticky lg:top-24 lg:self-start">
					<div className="rounded-xl border border-fd-border bg-fd-card p-5">
						<h2 className="font-semibold text-fd-foreground">Install</h2>

						<div className="mt-4 flex flex-col gap-5">
							{hasPackage && integration.npmPackage && (
								<div className="min-w-0">
									<p className="mb-2 font-medium text-fd-muted-foreground text-xs uppercase tracking-wide">npm package</p>
									<div className="overflow-x-auto">
										<Command command={`npm install ${integration.npmPackage}`} />
									</div>
								</div>
							)}

							{hasPlugin && pluginSlug && (
								<div>
									<p className="mb-2 font-medium text-fd-muted-foreground text-xs uppercase tracking-wide">WordPress plugin</p>
									<DownloadButton plugin={pluginSlug} />
									{release && (
										<p className="mt-2 text-fd-muted-foreground text-xs">
											Latest v{release.version}
											{release.publishedAt && ` · ${new Date(release.publishedAt).toLocaleDateString("en-US", { dateStyle: "medium" })}`}
										</p>
									)}
								</div>
							)}
						</div>

						<div className="mt-5 flex flex-col gap-2 border-fd-border border-t pt-4">
							{integration.docsUrl && (
								<Link
									href={integration.docsUrl}
									className="font-medium text-fd-foreground text-sm underline-offset-4 transition-colors hover:underline"
								>
									Read the docs
								</Link>
							)}
							<a
								href={reportIssueUrl(integration)}
								target="_blank"
								rel="noreferrer"
								className="font-medium text-fd-muted-foreground text-sm transition-colors hover:text-fd-foreground"
							>
								Report an issue
							</a>
						</div>
					</div>
				</aside>
			</div>
		</main>
	)
}

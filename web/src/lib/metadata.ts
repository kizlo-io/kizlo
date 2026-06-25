import type { Metadata } from "next"
import { appDescription, appName, siteUrl } from "./shared"

type CreateMetadata = Omit<Metadata, "title"> & {
	title?: string
}

export function createMetadata({ title, description, openGraph, twitter, ...rest }: CreateMetadata = {}): Metadata {
	const resolvedTitle = title ? `${title} | ${appName}` : `${appName} — The toolkit for headless WordPress`
	const resolvedDescription = description ?? appDescription

	return {
		title,
		description: resolvedDescription,
		openGraph: {
			title: resolvedTitle,
			description: resolvedDescription,
			url: siteUrl,
			siteName: appName,
			type: "website",
			...openGraph,
		} as Metadata["openGraph"],
		twitter: {
			card: "summary_large_image",
			title: resolvedTitle,
			description: resolvedDescription,
			creator: "@kizlo_io",
			...twitter,
		},
		...rest,
	}
}
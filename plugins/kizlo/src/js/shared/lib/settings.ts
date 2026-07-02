import { useStore } from "@nanostores/react"
import { FileText, Gear, Tag, WebhooksLogo } from "@phosphor-icons/react"
import apiFetch from "@wordpress/api-fetch"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import type { Settings, SettingsMap } from "./schema"
import { $settings } from "./store"
import type { Menu } from "./types"

export type SettingsKeys = keyof Settings

type UpdateOptions<K extends keyof SettingsMap> = [
	key: K,
	...(K extends "post_types" | "taxonomies" ? [slug: string] : []),
	data: SettingsMap[K],
]

export function useSettings() {
	const settings = useStore($settings)
	const [isLoading, setLoading] = useState(false)

	const update = async <K extends keyof SettingsMap>(...args: UpdateOptions<K>) => {
		setLoading(true)

		const key = args[0]
		const slug = typeof args[1] === "string" ? args[1] : null
		const data = (typeof args[1] === "string" ? args[2] : args[1]) as SettingsMap[K]

		await apiFetch<{ success: boolean } | { code: string; message: string; data: null }>({
			method: "PUT",
			body: JSON.stringify(data),
			path: `/kizlo/v1/settings/${key}${slug ? `/${slug}` : ""}`,
		})
			.then(() => toast.success("Settings saved successfully."))
			.catch(() => toast.error("Something went wrong, please try again."))
			.finally(() => setLoading(false))

		const existing = $settings.get()
		if (!existing) return null

		switch (key) {
			case "site":
				// TODO: remove any
				$settings.set({ ...existing, site: { ...existing.site, ...(data as any) } })
				break
			case "identity":
				$settings.set({ ...existing, identity: { ...existing.identity, ...(data as any) } })
				break
			case "post_types":
				$settings.set({
					...existing,
					post_types: existing.post_types.map((item) => (item.slug === slug ? { ...item, ...data } : item)),
				})
				break
			case "taxonomies":
				$settings.set({
					...existing,
					taxonomies: existing.taxonomies.map((item) => (item.slug === slug ? { ...item, ...data } : item)),
				})
				break
			case "webhook":
				$settings.set({ ...existing, webhook: { ...existing.webhook, ...(data as any) } })
				break
		}
	}

	return { settings, update, isLoading }
}

export function useMenus() {
	const { settings } = useSettings()

	// TODO: Remove title and descriptions from menu items.
	const menus = useMemo<Menu[]>(
		() => [
			{
				name: "General",
				icon: Gear,
				items: [
					{
						name: "Site",
						path: "/general/site",
					},
					{
						name: "Identity",
						path: "/general/identity",
					},
					{
						name: "Authors",
						path: "/general/authors",
					},
					{
						name: "Crawling",
						path: "/general/crawling",
					},
				],
			},
			{
				name: "Post Types",
				icon: FileText,
				items: (settings?.post_types ?? []).map((item) => ({
					name: item.name,
					path: `/post-types/${item.slug}`,
				})),
			},
			{
				name: "Taxonomies",
				icon: Tag,
				items: (settings?.taxonomies ?? []).map((item) => ({
					name: item.name,
					path: `/taxonomies/${item.slug}`,
				})),
			},
			{
				name: "Integrations",
				icon: WebhooksLogo,
				items: [
					{
						name: "Webhooks",
						path: "/integration/webhooks",
					},
				],
			},
		],
		[],
	)

	return menus
}

import { useStore } from "@nanostores/react"
import {
	ArticleIcon,
	FileIcon,
	FileTextIcon,
	FolderIcon,
	GlobeIcon,
	HashIcon,
	type Icon,
	IdentificationBadgeIcon,
	ImageIcon,
	PaletteIcon,
	RobotIcon,
	TagIcon,
	UploadSimpleIcon,
	UsersIcon,
	WebhooksLogoIcon,
} from "@phosphor-icons/react"
import apiFetch from "@wordpress/api-fetch"
import { type BaseSyntheticEvent, useMemo, useState } from "react"
import type { FieldValues, UseFormReturn } from "react-hook-form"
import { toast } from "sonner"
import type { Settings, SettingsMap } from "./schema"
import { $settings } from "./store"
import type { NavSection } from "./types"

const POST_TYPE_ICONS: Record<string, Icon> = { post: ArticleIcon, page: FileIcon, attachment: ImageIcon }
const TAXONOMY_ICONS: Record<string, Icon> = { category: FolderIcon, post_tag: HashIcon }

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
				$settings.set({ ...existing, site: { ...existing.site, ...(data as any) } })
				break
			case "brand":
				$settings.set({ ...existing, brand: { ...existing.brand, ...(data as any) } })
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
			case "uploads":
				$settings.set({ ...existing, uploads: { ...existing.uploads, ...(data as any) } })
				break
		}
	}

	return { settings, update, isLoading }
}

type SingleSettingsKey = Exclude<keyof SettingsMap, "post_types" | "taxonomies">
type CollectionSettingsKey = Extract<keyof SettingsMap, "post_types" | "taxonomies">

interface SettingsFormBindings {
	isLoading: boolean
	isDirty: boolean
	onSubmit: (event?: BaseSyntheticEvent) => Promise<void>
	onCancel: () => void
}

export function useSettingsForm<K extends SingleSettingsKey, TInput extends FieldValues>(
	key: K,
	form: UseFormReturn<TInput, unknown, SettingsMap[K]>,
): SettingsFormBindings
export function useSettingsForm<K extends CollectionSettingsKey, TInput extends FieldValues>(
	key: K,
	slug: string,
	form: UseFormReturn<TInput, unknown, SettingsMap[K]>,
): SettingsFormBindings
export function useSettingsForm(
	key: keyof SettingsMap,
	slugOrForm: string | UseFormReturn<FieldValues, unknown, FieldValues>,
	collectionForm?: UseFormReturn<FieldValues, unknown, FieldValues>,
): SettingsFormBindings {
	const { update, isLoading } = useSettings()
	const slug = typeof slugOrForm === "string" ? slugOrForm : null
	const form = (slug === null ? slugOrForm : collectionForm) as UseFormReturn<FieldValues, unknown, FieldValues>
	const save = update as (...args: unknown[]) => Promise<unknown>

	return {
		isLoading,
		isDirty: form.formState.isDirty,
		onSubmit: form.handleSubmit(async (data) => {
			await (slug === null ? save(key, data) : save(key, slug, data))
			form.reset(form.getValues())
		}),
		onCancel: () => form.reset(),
	}
}

export function useNav(): NavSection[] {
	const { settings } = useSettings()

	return useMemo<NavSection[]>(
		() => [
			{
				label: "General",
				items: [
					{ type: "link", name: "Site", path: "/general/site", icon: GlobeIcon },
					{ type: "link", name: "Identity", path: "/general/identity", icon: IdentificationBadgeIcon },
					{ type: "link", name: "Branding", path: "/general/branding", icon: PaletteIcon },
					{ type: "link", name: "Authors", path: "/general/authors", icon: UsersIcon },
					{ type: "link", name: "Crawling", path: "/general/crawling", icon: RobotIcon },
				],
			},
			{
				label: "Content",
				items: [
					{
						type: "group",
						id: "post-types",
						name: "Post Types",
						icon: FileTextIcon,
						items: (settings?.post_types ?? []).map((item) => ({
							name: item.name,
							path: `/post-types/${item.slug}`,
							icon: POST_TYPE_ICONS[item.slug] ?? FileTextIcon,
						})),
					},
					{
						type: "group",
						id: "taxonomies",
						name: "Taxonomies",
						icon: TagIcon,
						items: (settings?.taxonomies ?? []).map((item) => ({
							name: item.name,
							path: `/taxonomies/${item.slug}`,
							icon: TAXONOMY_ICONS[item.slug] ?? TagIcon,
						})),
					},
				],
			},
			{
				label: "System",
				items: [
					{ type: "link", name: "Uploads", path: "/system/uploads", icon: UploadSimpleIcon },
					{ type: "link", name: "Webhooks", path: "/system/webhooks", icon: WebhooksLogoIcon },
				],
			},
		],
		[settings],
	)
}

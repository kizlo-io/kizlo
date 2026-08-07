import { useStore } from "@nanostores/react"
import { ArticleIcon, FileIcon, FileTextIcon, FolderIcon, HashIcon, type Icon, ImageIcon, TagIcon } from "@phosphor-icons/react"
import apiFetch from "@wordpress/api-fetch"
import { type BaseSyntheticEvent, useMemo, useState } from "react"
import type { FieldValues, UseFormReturn } from "react-hook-form"
import { toast } from "sonner"
import { type PageDef, postTypeSections, STATIC_PAGES, taxonomySections } from "@/modules/settings/nav-model"
import type { Settings, SettingsMap } from "./schema"
import { $settings } from "./store"
import type { NavBlock, NavPage } from "./types"

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

		try {
			// Media-bearing sections return their saved state with attachment ids
			// resolved back to { id, src } objects. Merge that into the store rather
			// than the submitted form data (bare ids), which would otherwise clobber
			// every media preview until the next refresh. Sections that reply 204 fall
			// back to the submitted data, whose shape matches the store.
			const response = await apiFetch<SettingsMap[K] | null>({
				method: "PUT",
				body: JSON.stringify(data),
				path: `/kizlo/v1/settings/${key}${slug ? `/${slug}` : ""}`,
			})

			toast.success("Settings saved successfully.")

			const existing = $settings.get()
			if (existing) $settings.set(applyUpdate(existing, key, slug, response ?? data))
		} catch {
			toast.error("Something went wrong, please try again.")
		} finally {
			setLoading(false)
		}
	}

	return { settings, update, isLoading }
}

function applyUpdate<K extends keyof SettingsMap>(existing: Settings, key: K, slug: string | null, data: SettingsMap[K]): Settings {
	switch (key) {
		case "post_types":
			return {
				...existing,
				post_types: existing.post_types.map((item) => (item.slug === slug ? { ...item, ...(data as any) } : item)),
			}
		case "taxonomies":
			return {
				...existing,
				taxonomies: existing.taxonomies.map((item) => (item.slug === slug ? { ...item, ...(data as any) } : item)),
			}
		default:
			return { ...existing, [key]: { ...(existing[key as SettingsKeys] as object), ...(data as any) } }
	}
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

function staticPageNode(page: PageDef): NavPage {
	return {
		type: "page",
		id: page.id,
		name: page.name,
		path: page.path,
		icon: page.icon,
		sections: page.sections.map((section) => ({ id: section.id, name: section.title, icon: section.icon })),
	}
}

export function useNav(): NavBlock[] {
	const { settings } = useSettings()

	return useMemo<NavBlock[]>(
		() => [
			{ label: "General", items: STATIC_PAGES.filter((page) => page.block === "General").map(staticPageNode) },
			{
				label: "Content",
				items: [
					{
						type: "group",
						id: "post-types",
						name: "Post Types",
						icon: FileTextIcon,
						onCreate: "/post-types/new",
						items: (settings?.post_types ?? []).map<NavPage>((item) => ({
							type: "page",
							id: `post-types/${item.slug}`,
							name: item.name,
							path: `/post-types/${item.slug}`,
							icon: POST_TYPE_ICONS[item.slug] ?? FileTextIcon,
							inactive: item.kizlo_owned && !item.active,
							sections: postTypeSections({
								internal: item.internal,
								kizlo_owned: item.kizlo_owned,
								hasRegistration: Boolean(item.registration),
							}),
						})),
					},
					{
						type: "group",
						id: "taxonomies",
						name: "Taxonomies",
						icon: TagIcon,
						onCreate: "/taxonomies/new",
						items: (settings?.taxonomies ?? []).map<NavPage>((item) => ({
							type: "page",
							id: `taxonomies/${item.slug}`,
							name: item.name,
							path: `/taxonomies/${item.slug}`,
							icon: TAXONOMY_ICONS[item.slug] ?? TagIcon,
							inactive: item.kizlo_owned && !item.active,
							sections: taxonomySections({
								internal: item.internal,
								kizlo_owned: item.kizlo_owned,
								hasRegistration: Boolean(item.registration),
							}),
						})),
					},
				],
			},
			{ label: "System", items: STATIC_PAGES.filter((page) => page.block === "System").map(staticPageNode) },
		],
		[settings],
	)
}

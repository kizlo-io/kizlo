import { useEffect, useState } from "@wordpress/element"
import type { VariableContext } from "./resolve"
import type { SeoVariant } from "./types"

type Selectors = Record<string, (...args: unknown[]) => unknown>

interface WpData {
	select: (store: string) => Selectors | undefined
	subscribe: (listener: () => void) => () => void
}

interface WpDate {
	getSettings: () => { formats: { date: string } }
	dateI18n: (format: string, date: string) => string
}

interface WpUrl {
	cleanForSlug: (value: string) => string
}

interface TinyMceEditor {
	getContent: (args?: { format: string }) => string
	isHidden?: () => boolean
	on: (events: string, handler: () => void) => void
	off: (events: string, handler: () => void) => void
}

interface TinyMce {
	get: (id: string) => TinyMceEditor | null
	on: (event: string, handler: () => void) => void
	off: (event: string, handler: () => void) => void
}

interface WpGlobal {
	data?: WpData
	date?: WpDate
	url?: WpUrl
}

function wp(): WpGlobal | undefined {
	return (window as unknown as { wp?: WpGlobal }).wp
}

function tinymce(): TinyMce | undefined {
	return (window as unknown as { tinymce?: TinyMce }).tinymce
}

function str(value: unknown): string {
	return typeof value === "string" ? value : value == null ? "" : String(value)
}

function slugify(value: string): string {
	const url = wp()?.url
	if (url) return url.cleanForSlug(value)

	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
}

function formatDate(iso: string): string {
	if (!iso) return ""
	const date = wp()?.date
	if (date) return date.dateI18n(date.getSettings().formats.date, iso)

	return iso.slice(0, 10)
}

function excerptFromContent(html: string, maxWords = 55): string {
	const el = document.createElement("div")
	el.innerHTML = html
	const text = str(el.textContent).replace(/\s+/g, " ").trim()
	if (!text) return ""

	const words = text.split(" ")
	return words.length > maxWords ? `${words.slice(0, maxWords).join(" ")} …` : text
}

function withDateParts(context: VariableContext, iso: string): void {
	context.date = formatDate(iso)
	context.year = iso.slice(0, 4)
	context.month = iso.slice(5, 7)
	context.day = iso.slice(8, 10)
}

function readBlockContext(): VariableContext | null {
	const editor = wp()?.data?.select("core/editor")
	if (!editor?.getEditedPostAttribute) return null

	const attr = (name: string): string => str(editor.getEditedPostAttribute?.(name))
	const core = wp()?.data?.select("core")

	const title = attr("title")
	const rawContent = str(editor.getEditedPostContent?.()) || attr("content")
	const context: VariableContext = {
		title,
		slug: attr("slug") || slugify(title),
		excerpt: attr("excerpt"),
		content: excerptFromContent(rawContent),
		id: str(editor.getCurrentPostId?.()),
		modified_date: formatDate(attr("modified")),
	}
	withDateParts(context, attr("date"))

	const site = core?.getEntityRecord?.("root", "site") as { title?: string; description?: string } | undefined
	if (site) {
		context.site_name = str(site.title)
		context.tagline = str(site.description)
	}

	const authorId = editor.getEditedPostAttribute?.("author")
	if (authorId) {
		const author = core?.getEntityRecord?.("root", "user", authorId) as { name?: string } | undefined
		if (author?.name) context.author = author.name
	}

	const categories = editor.getEditedPostAttribute?.("categories")
	const primaryCategory = Array.isArray(categories) ? categories[0] : undefined
	if (primaryCategory) {
		const term = core?.getEntityRecord?.("taxonomy", "category", primaryCategory) as { name?: string } | undefined
		if (term?.name) context.category = term.name
	}

	return context
}

function input(id: string): string {
	const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null
	return el ? str(el.value) : ""
}

function fieldContent(id: string): string {
	const editor = tinymce()?.get(id)
	if (editor && !editor.isHidden?.()) return editor.getContent()

	return input(id)
}

function readClassicPostContext(): VariableContext {
	const title = input("title")
	const slug = input("new-post-slug") || str(document.getElementById("editable-post-name-full")?.textContent).trim()

	return {
		title,
		slug: slug || input("post_name") || slugify(title),
		excerpt: input("excerpt"),
		content: excerptFromContent(fieldContent("content")),
	}
}

function readTermContext(): VariableContext {
	const title = input("name")

	return {
		title,
		slug: input("slug") || slugify(title),
		description: fieldContent("description"),
	}
}

function readContext(variant: SeoVariant): VariableContext {
	if (variant === "term") return readTermContext()

	return readBlockContext() ?? readClassicPostContext()
}

const CLASSIC_FIELDS: Record<SeoVariant, { inputs: string[]; editors: string[] }> = {
	post: { inputs: ["title", "content", "excerpt"], editors: ["content"] },
	term: { inputs: ["name", "slug", "description"], editors: ["description"] },
}

const MCE_EVENTS = "input keyup change NodeChange SetContent Undo Redo"

function subscribe(variant: SeoVariant, sync: () => void): () => void {
	const disposers: Array<() => void> = []

	const data = wp()?.data
	const hasEditorStore = Boolean(data?.select("core/editor")?.getEditedPostAttribute)
	if (data && hasEditorStore) {
		disposers.push(data.subscribe(sync))
	}

	const nodes = CLASSIC_FIELDS[variant].inputs.map((id) => document.getElementById(id)).filter((node): node is HTMLElement => node != null)

	for (const node of nodes) {
		node.addEventListener("input", sync)
		node.addEventListener("keyup", sync)
	}
	disposers.push(() => {
		for (const node of nodes) {
			node.removeEventListener("input", sync)
			node.removeEventListener("keyup", sync)
		}
	})

	if (variant === "post" && !hasEditorStore) {
		const onSlugEdit = (event: Event) => {
			const target = event.target as HTMLElement | null
			if (target?.id === "new-post-slug" || target?.closest?.("#edit-slug-buttons")) sync()
		}
		const events = ["input", "keyup", "click"] as const
		for (const type of events) document.addEventListener(type, onSlugEdit)
		disposers.push(() => {
			for (const type of events) document.removeEventListener(type, onSlugEdit)
		})
	}

	const bound = new Map<string, TinyMceEditor>()
	const bindEditors = () => {
		for (const id of CLASSIC_FIELDS[variant].editors) {
			const editor = tinymce()?.get(id)
			if (!editor || bound.get(id) === editor) continue
			bound.set(id, editor)
			editor.on(MCE_EVENTS, sync)
			sync()
		}
	}
	bindEditors()
	const mceHost = tinymce()
	mceHost?.on("AddEditor", bindEditors)
	disposers.push(() => {
		for (const editor of bound.values()) editor.off(MCE_EVENTS, sync)
		mceHost?.off("AddEditor", bindEditors)
	})

	return () => {
		for (const dispose of disposers) dispose()
	}
}

export function useEditorContext(baseline: VariableContext, variant: SeoVariant): VariableContext {
	const merge = (): VariableContext => ({ ...baseline, ...readContext(variant) })
	const [context, setContext] = useState<VariableContext>(merge)

	useEffect(() => {
		let previous = JSON.stringify(context)

		const sync = () => {
			const next = merge()
			const serialized = JSON.stringify(next)
			if (serialized === previous) return

			previous = serialized
			setContext(next)
		}

		sync()
		return subscribe(variant, sync)
	}, [])

	return context
}

import {
	AddressBookIcon,
	ArrowsClockwiseIcon,
	BarcodeIcon,
	BookmarkIcon,
	BracketsCurlyIcon,
	BrowserIcon,
	BuildingsIcon,
	DeviceMobileIcon,
	EyeIcon,
	FileArrowUpIcon,
	GlobeIcon,
	type Icon,
	IdentificationBadgeIcon,
	IdentificationCardIcon,
	ImageIcon,
	ImageSquareIcon,
	InfoIcon,
	KeyIcon,
	LayoutIcon,
	LightningIcon,
	LinkIcon,
	MagnifyingGlassIcon,
	MapTrifoldIcon,
	NotePencilIcon,
	PaletteIcon,
	PenNibIcon,
	PlugsConnectedIcon,
	PowerIcon,
	RobotIcon,
	ScrollIcon,
	ShareNetworkIcon,
	ShieldCheckIcon,
	ShieldIcon,
	SignpostIcon,
	SwatchesIcon,
	TagIcon,
	TextAaIcon,
	TextboxIcon,
	TrashIcon,
	UploadSimpleIcon,
	UserCircleIcon,
	UserIcon,
	UsersIcon,
	WebhooksLogoIcon,
} from "@phosphor-icons/react"
import type { ReactNode } from "react"
import type { NavSectionLink } from "@/shared/lib/types"

/**
 * Single source of truth for the settings hierarchy: menu block → page → sections.
 *
 * Section identity (id + title + desc) is declared once here and consumed by BOTH
 * the sidebar (as jump-links) and the page components (as their headings), so the
 * two can never drift. Form fields stay as JSX in the page components — only the
 * section shell is data.
 */

export interface SectionDef {
	/** DOM anchor id, unique within its page. */
	id: string
	title: string
	desc?: ReactNode
	/** Icon for the sidebar's section jump-link (not rendered on the heading yet). */
	icon: Icon
}

export interface PageDef {
	/** Node id for the sidebar drill stack; mirrors the route (e.g. "general/site"). */
	id: string
	path: string
	name: string
	icon: Icon
	block: "General" | "System"
	sections: SectionDef[]
}

export const STATIC_PAGES: PageDef[] = [
	{
		id: "general/site",
		path: "/general/site",
		name: "Site",
		icon: GlobeIcon,
		block: "General",
		sections: [
			{
				id: "site-identity",
				title: "Site identity",
				desc: "Core settings that identify your site to Kizlo and secure communication between the plugin and Kizlo sdk.",
				icon: IdentificationCardIcon,
			},
			{
				id: "site-info",
				title: "Site info",
				desc: "Configure your website's core details such as name, URL, branding defaults, and search behavior used across metadata and structured data.",
				icon: InfoIcon,
			},
			{
				id: "seo-defaults",
				title: "SEO Defaults",
				desc: "Fallback assets used when a post or page has no SEO image set. Shown when your content is shared on X, Facebook, LinkedIn, and similar platforms.",
				icon: ShareNetworkIcon,
			},
			{
				id: "search-visibility",
				title: "Search engine visibility",
				desc: "Controls whether search engines are allowed to index your headless frontend.",
				icon: EyeIcon,
			},
		],
	},
	{
		id: "general/identity",
		path: "/general/identity",
		name: "Identity",
		icon: IdentificationBadgeIcon,
		block: "General",
		sections: [
			{
				id: "identity",
				title: "Identity",
				desc: "Select whether this site represents a person or an organization. This determines which structured data (Schema.org) Kizlo outputs and which fields are shown below.",
				icon: IdentificationCardIcon,
			},
			{
				id: "person",
				title: "Person",
				desc: "Details about the individual behind this site. Used in Schema.org Person structured data and author metadata across your posts.",
				icon: UserIcon,
			},
			{
				id: "organization",
				title: "Organization",
				desc: "Core details about your organization. Used in Schema.org Organization structured data across your site.",
				icon: BuildingsIcon,
			},
			{
				id: "contact-legal",
				title: "Contact & Legal",
				desc: "Contact details and legal information. These help search engines and knowledge panels display accurate business info.",
				icon: AddressBookIcon,
			},
			{
				id: "founder",
				title: "Founder",
				desc: "Optionally attribute the organization to a founder. Maps to Schema.org founder and helps Google associate the brand with an individual.",
				icon: UserCircleIcon,
			},
			{
				id: "business-identifiers",
				title: "Business Identifiers",
				desc: "Registry and tax identifiers. Optional; fill in only what applies to your organization. Each maps to the matching Schema.org property.",
				icon: BarcodeIcon,
			},
			{
				id: "publishing-policies",
				title: "Publishing & Policies",
				desc: "Policy page URLs used mainly by publishers and news sites. Each maps to the matching Schema.org property and helps Google understand your editorial standards.",
				icon: ScrollIcon,
			},
		],
	},
	{
		id: "general/branding",
		path: "/general/branding",
		name: "Branding",
		icon: PaletteIcon,
		block: "General",
		sections: [
			{
				id: "colors",
				title: "Colors",
				desc: "The theme color tints the mobile browser chrome and the installed app's window; its dark variant is used when the visitor prefers a dark color scheme. The background color fills the app launch screen while it loads.",
				icon: SwatchesIcon,
			},
			{
				id: "primary-logo",
				title: "Primary logo",
				desc: "The full lockup, typically the icon plus the word mark. The dark variant is shown when the visitor prefers a dark color scheme; the light version is used when it's empty.",
				icon: ImageIcon,
			},
			{
				id: "icon",
				title: "Icon",
				desc: "The square mark on its own, without the wordmark. Used in tight spaces such as a collapsed header or an avatar.",
				icon: ImageSquareIcon,
			},
			{ id: "wordmark", title: "Wordmark", desc: "The brand name set as a logotype, without the icon.", icon: TextAaIcon },
			{
				id: "favicon",
				title: "Favicon",
				desc: "The icon browsers show in tabs and bookmarks. A single icon is used across light and dark browser themes, so choose one that stays legible on both.",
				icon: BrowserIcon,
			},
			{
				id: "app-icon",
				title: "App icon",
				desc: "Used when your site is added to a home screen or installed as an app on any platform. One icon serves them all.",
				icon: DeviceMobileIcon,
			},
		],
	},
	{
		id: "general/authors",
		path: "/general/authors",
		name: "Authors",
		icon: UsersIcon,
		block: "General",
		sections: [
			{
				id: "authors",
				title: "Authors",
				desc: "Manage the URL structure and SEO configuration for author archive pages, including title templates, meta descriptions, and search visibility.",
				icon: PenNibIcon,
			},
			{ id: "seo", title: "SEO", desc: "Control how search engines see and display authors.", icon: MagnifyingGlassIcon },
		],
	},
	{
		id: "general/crawling",
		path: "/general/crawling",
		name: "Crawling",
		icon: RobotIcon,
		block: "General",
		sections: [
			{ id: "sitemap", title: "Sitemap", desc: "Control how your sitemap is exposed to search engines.", icon: MapTrifoldIcon },
			{
				id: "robots",
				title: "Robots",
				desc: "Control how search engines crawl your site. These settings are used to generate your robots.txt data.",
				icon: RobotIcon,
			},
		],
	},
	{
		id: "system/uploads",
		path: "/system/uploads",
		name: "Uploads",
		icon: UploadSimpleIcon,
		block: "System",
		sections: [
			{
				id: "allowed-file-types",
				title: "Allowed File Types",
				desc: "Let editors upload file types that WordPress blocks by default, such as SVG logos and ICO favicons. Add each type as a file extension and its matching MIME type. Uploaded SVGs are automatically sanitized to remove scripts and other unsafe content. Executable and script types are refused for security.",
				icon: FileArrowUpIcon,
			},
		],
	},
	{
		id: "system/headless",
		path: "/system/headless",
		name: "Headless",
		icon: ShieldIcon,
		block: "System",
		sections: [
			{
				id: "headless-mode",
				title: "Headless Mode",
				desc: "Shut down or redirect the WordPress surfaces that only exist to display or advertise your WordPress origin. This is the master switch. When it is off, every option below is inert and WordPress behaves natively.",
				icon: PowerIcon,
			},
			{
				id: "editor-experience",
				title: "Editor experience",
				desc: "Redirect the two editor affordances that assume a rendered WordPress site to your headless frontend instead.",
				icon: NotePencilIcon,
			},
			{
				id: "display-routing",
				title: "Display & routing",
				desc: "Close down public theme output that a headless setup does not use.",
				icon: SignpostIcon,
			},
			{
				id: "search-engine-control",
				title: "Search-engine control",
				desc: "Index your headless frontend, not the WordPress backend.",
				icon: MagnifyingGlassIcon,
			},
			{
				id: "security-hardening",
				title: "Security hardening",
				desc: "Shrink the attack and information-leak surface of the WordPress origin.",
				icon: ShieldCheckIcon,
			},
		],
	},
	{
		id: "system/webhooks",
		path: "/system/webhooks",
		name: "Webhooks",
		icon: WebhooksLogoIcon,
		block: "System",
		sections: [
			{
				id: "webhook-urls",
				title: "Webhook URLs",
				desc: "One or more endpoints that will receive a POST request when triggered content changes. Each URL must be publicly accessible.",
				icon: LinkIcon,
			},
			{
				id: "triggers",
				title: "Triggers",
				desc: "Choose which post types and taxonomies cause a webhook to fire when their content is created, updated, or deleted.",
				icon: LightningIcon,
			},
		],
	},
]

/** Section props for a page heading — the icon is for the sidebar only, not the heading. */
type SectionHeading = Omit<SectionDef, "icon">

/**
 * Returns a lookup for a static page's sections, keyed by id and ready to spread
 * onto a section component: `<SettingsSection {...S("site-identity")} />`. Throws
 * on an unknown id so a typo surfaces immediately rather than rendering an
 * untitled section.
 */
export function sectionsFor(pageId: string): (sectionId: string) => SectionHeading {
	const page = STATIC_PAGES.find((p) => p.id === pageId)
	const map = new Map((page?.sections ?? []).map((s) => [s.id, s]))

	return (sectionId) => {
		const found = map.get(sectionId)
		if (!found) throw new Error(`Unknown settings section: ${pageId}/${sectionId}`)
		return { id: found.id, title: found.title, desc: found.desc }
	}
}

// ── Dynamic-page anchors ────────────────────────────────────────────────
// Post types / taxonomies build their sections at runtime (titles come from
// getContent, gated by internal/kizlo_owned), so their anchors are shared
// constants both the page and the nav reference.

/** Main (settings) form anchors, shared by post types and taxonomies. */
export const SECTION_URL = "url-structure"
export const SECTION_CUSTOM_FIELDS = "custom-fields"
export const SECTION_SEO = "seo"
export const SECTION_REST_API = "rest-api"

/** Registration form anchors. */
export const REG_DETAILS = "reg-details"
export const REG_CAPABILITIES = "reg-capabilities" // post type only
export const REG_DEFAULT_TERM = "reg-default-term" // taxonomy only
export const REG_ADMIN_UI = "reg-admin-ui"
export const REG_API = "reg-api"
export const REG_URLS = "reg-urls"
export const REG_LABELS = "reg-labels"
export const REG_DELETE = "reg-delete"

interface DynamicPageMeta {
	internal: boolean
	kizlo_owned: boolean
	hasRegistration: boolean
}

export function postTypeSections({ internal, kizlo_owned, hasRegistration }: DynamicPageMeta): NavSectionLink[] {
	const links: NavSectionLink[] = []

	// Registration form renders above the main form, so its sections come first.
	if (kizlo_owned && hasRegistration) {
		links.push(
			{ id: REG_DETAILS, name: "Details", icon: InfoIcon },
			{ id: REG_ADMIN_UI, name: "Admin UI", icon: LayoutIcon },
			{ id: REG_URLS, name: "URLs", icon: ArrowsClockwiseIcon },
			{ id: REG_API, name: "API", icon: BracketsCurlyIcon },
			{ id: REG_CAPABILITIES, name: "Capabilities", icon: KeyIcon },
			{ id: REG_LABELS, name: "Label overrides", icon: TagIcon },
		)
	}

	links.push(
		{ id: SECTION_URL, name: "URL Structure", icon: LinkIcon },
		{ id: SECTION_CUSTOM_FIELDS, name: "Custom fields", icon: TextboxIcon },
		{ id: SECTION_SEO, name: "SEO", icon: MagnifyingGlassIcon },
	)
	if (!internal) links.push({ id: SECTION_REST_API, name: "REST API", icon: PlugsConnectedIcon })

	// Delete lives at the very bottom of the page, after the main form.
	if (kizlo_owned && hasRegistration) links.push({ id: REG_DELETE, name: "Delete", icon: TrashIcon })

	return links
}

export function taxonomySections({ internal, kizlo_owned, hasRegistration }: DynamicPageMeta): NavSectionLink[] {
	const links: NavSectionLink[] = []

	if (kizlo_owned && hasRegistration) {
		links.push(
			{ id: REG_DETAILS, name: "Details", icon: InfoIcon },
			{ id: REG_DEFAULT_TERM, name: "Default term", icon: BookmarkIcon },
			{ id: REG_ADMIN_UI, name: "Admin UI", icon: LayoutIcon },
			{ id: REG_URLS, name: "URLs", icon: ArrowsClockwiseIcon },
			{ id: REG_API, name: "API", icon: BracketsCurlyIcon },
			{ id: REG_LABELS, name: "Label overrides", icon: TagIcon },
		)
	}

	links.push(
		{ id: SECTION_URL, name: "URL Structure", icon: LinkIcon },
		{ id: SECTION_CUSTOM_FIELDS, name: "Custom fields", icon: TextboxIcon },
		{ id: SECTION_SEO, name: "SEO", icon: MagnifyingGlassIcon },
	)
	if (!internal) links.push({ id: SECTION_REST_API, name: "REST API", icon: PlugsConnectedIcon })

	// Delete lives at the very bottom of the page, after the main form.
	if (kizlo_owned && hasRegistration) links.push({ id: REG_DELETE, name: "Delete", icon: TrashIcon })

	return links
}

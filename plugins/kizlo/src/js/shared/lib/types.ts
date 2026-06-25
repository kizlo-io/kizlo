import type { LucideProps } from "lucide-react"

export interface Menu {
	name: string
	icon: React.ForwardRefExoticComponent<Omit<LucideProps, "ref"> & React.RefAttributes<SVGSVGElement>>
	items: MenuItem[]
}

export interface MenuItem {
	name: string
	path: string
}

// ====================================================
// TYPES
// ====================================================

// export interface GeneralSiteSettings {
// 	url: string | null
// 	name: string | null
// 	alternate_name: string | null
// 	tagline: string | null
// 	title_separator: string
// 	fallback_image: string | null
// 	search_action_enabled: boolean
// 	search_action_url: string | null
// }

// export interface GeneralIdentitySettings {
// 	type: "person" | "organization"
// 	person: {
// 		name: string
// 		image: string | null
// 		social_profiles: Record<string, string> | null
// 	} | null
// 	organization: {
// 		name: string
// 		alternate_name: string | null
// 		slogan: string | null
// 		description: string | null
// 		email: string | null
// 		phone: string | null
// 		legal_name: string | null
// 		founding_date: string | null
// 		founder: {
// 			name: string
// 			social_profiles: Record<string, string> | null
// 		} | null
// 		employees: number | null
// 		logo: string | null
// 		social_profiles: Record<string, string> | null
// 	} | null
// }

// export interface PostTypeSettings {
// 	name: string
// 	slug: string
// 	url: string | null
// 	seo: {
// 		title_structure: string | null
// 		description_structure: string | null
// 		search_engine_visibility: boolean | null
// 		webpage_type: string | null
// 		article_type: string | null
// 	}
// }

// export interface TaxonomySettings {
// 	name: string
// 	slug: string
// 	url: string | null
// 	seo: {
// 		title_structure: string | null
// 		description_structure: string | null
// 		search_engine_visibility: boolean | null
// 		webpage_type: string | null
// 	}
// }

// export interface SecurityRecaptchaSettings {
// 	key: string
// 	secret: string
// 	enabled: boolean
// }

// export interface SecurityTurnstileSettings {
// 	key: string
// 	secret: string
// 	enabled: boolean
// }

// export interface IntegrationWebhookSettings {
// 	secret: string
// 	post_types: string[]
// 	taxonomies: string[]
// 	webhook_urls: string[]
// }

// export interface Settings {
// 	general: {
// 		site: GeneralSiteSettings
// 		identity: GeneralIdentitySettings
// 	}
// 	post_types: PostTypeSettings[]
// 	taxonomies: TaxonomySettings[]
// 	security: {
// 		recaptcha: SecurityRecaptchaSettings
// 		turnstile: SecurityTurnstileSettings
// 	}
// 	integration: {
// 		webhook: IntegrationWebhookSettings
// 	}
// }

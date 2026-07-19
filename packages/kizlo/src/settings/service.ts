import type { WordPressService } from "../wordpress"
import { WP_KIZLO_BASE } from "../wordpress"
import type {
	AuthorsSettings,
	AuthorsSettingsInput,
	BrandSettings,
	BrandSettingsInput,
	CrawlingSettings,
	CrawlingSettingsInput,
	IdentitySettings,
	IdentitySettingsInput,
	PostTypeSettings,
	PostTypeSettingsInput,
	Settings,
	SiteSettings,
	SiteSettingsInput,
	TaxonomySettings,
	TaxonomySettingsInput,
	UploadsSettings,
	UploadsSettingsInput,
	WebhookSettings,
	WebhookSettingsInput,
} from "./service.interface"

export class SettingsService {
	private readonly wordpress: WordPressService

	constructor(wordpress: WordPressService) {
		this.wordpress = wordpress
	}

	/** Fetch every Kizlo settings section in one response. */
	public async get() {
		return this.wordpress.get<Settings>("/settings", { base: WP_KIZLO_BASE })
	}

	public async updateSite(input: SiteSettingsInput) {
		return this.update<SiteSettings>("/settings/site", input)
	}

	public async updateBrand(input: BrandSettingsInput) {
		return this.update<BrandSettings>("/settings/brand", input)
	}

	public async updateWebhook(input: WebhookSettingsInput) {
		return this.update<WebhookSettings>("/settings/webhook", input)
	}

	public async updateIdentity(input: IdentitySettingsInput) {
		return this.update<IdentitySettings>("/settings/identity", input)
	}

	public async updateAuthors(input: AuthorsSettingsInput) {
		return this.update<AuthorsSettings>("/settings/authors", input)
	}

	public async updateCrawling(input: CrawlingSettingsInput) {
		return this.update<CrawlingSettings>("/settings/crawling", input)
	}

	public async updateUploads(input: UploadsSettingsInput) {
		return this.update<UploadsSettings>("/settings/uploads", input)
	}

	public async updatePostType(key: string, input: PostTypeSettingsInput) {
		return this.update<PostTypeSettings>(`/settings/post_types/${key}`, input)
	}

	public async updateTaxonomy(key: string, input: TaxonomySettingsInput) {
		return this.update<TaxonomySettings>(`/settings/taxonomies/${key}`, input)
	}

	private async update<TData>(path: string, body: unknown) {
		return this.wordpress.put<TData, "invalid_param">(path, { base: WP_KIZLO_BASE, body })
	}
}

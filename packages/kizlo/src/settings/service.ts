import type { ActiveWordPressClient, WP_EndpointResult } from "../wordpress"
import type {
	AuthorsSettingsInput,
	BrandSettingsInput,
	CrawlingSettingsInput,
	HeadlessSettingsInput,
	IdentitySettingsInput,
	PostTypeSettingsInput,
	SiteSettingsInput,
	TaxonomySettingsInput,
	UploadsSettingsInput,
	WebhookSettingsInput,
} from "./service.interface"

export class SettingsService {
	private readonly wordpress: ActiveWordPressClient

	constructor(wordpress: ActiveWordPressClient) {
		this.wordpress = wordpress
	}

	/** Fetch every Kizlo settings section in one response. */
	public async get(): Promise<WP_EndpointResult<"settings.retrieve">> {
		return this.wordpress.settings.retrieve()
	}

	public async updateSite(input: SiteSettingsInput): Promise<WP_EndpointResult<"settings.site.update">> {
		return this.wordpress.settings.site.update(input)
	}

	public async updateBrand(input: BrandSettingsInput): Promise<WP_EndpointResult<"settings.brand.update">> {
		return this.wordpress.settings.brand.update(input)
	}

	public async updateWebhook(input: WebhookSettingsInput): Promise<WP_EndpointResult<"settings.webhook.update">> {
		return this.wordpress.settings.webhook.update(input)
	}

	public async updateIdentity(input: IdentitySettingsInput): Promise<WP_EndpointResult<"settings.identity.update">> {
		return this.wordpress.settings.identity.update(input)
	}

	public async updateAuthors(input: AuthorsSettingsInput): Promise<WP_EndpointResult<"settings.authors.update">> {
		return this.wordpress.settings.authors.update(input)
	}

	public async updateCrawling(input: CrawlingSettingsInput): Promise<WP_EndpointResult<"settings.crawling.update">> {
		return this.wordpress.settings.crawling.update(input)
	}

	public async updateUploads(input: UploadsSettingsInput): Promise<WP_EndpointResult<"settings.uploads.update">> {
		return this.wordpress.settings.uploads.update(input)
	}

	public async updateHeadless(input: HeadlessSettingsInput): Promise<WP_EndpointResult<"settings.headless.update">> {
		return this.wordpress.settings.headless.update(input)
	}

	public async updatePostType(key: string, input: PostTypeSettingsInput): Promise<WP_EndpointResult<"settings.postTypes.update">> {
		return this.wordpress.settings.postTypes.update({ ...input, slug: key })
	}

	public async updateTaxonomy(key: string, input: TaxonomySettingsInput): Promise<WP_EndpointResult<"settings.taxonomies.update">> {
		return this.wordpress.settings.taxonomies.update({ ...input, slug: key })
	}
}

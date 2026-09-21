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
	public async get(): Promise<WP_EndpointResult<"kizlo.settings.retrieve">> {
		return this.wordpress.kizlo.settings.retrieve()
	}

	public async updateSite(input: SiteSettingsInput): Promise<WP_EndpointResult<"kizlo.settings.site.update">> {
		return this.wordpress.kizlo.settings.site.update({ body: input })
	}

	public async updateBrand(input: BrandSettingsInput): Promise<WP_EndpointResult<"kizlo.settings.brand.update">> {
		return this.wordpress.kizlo.settings.brand.update({ body: input })
	}

	public async updateWebhook(input: WebhookSettingsInput): Promise<WP_EndpointResult<"kizlo.settings.webhook.update">> {
		return this.wordpress.kizlo.settings.webhook.update({ body: input })
	}

	public async updateIdentity(input: IdentitySettingsInput): Promise<WP_EndpointResult<"kizlo.settings.identity.update">> {
		return this.wordpress.kizlo.settings.identity.update({ body: input })
	}

	public async updateAuthors(input: AuthorsSettingsInput): Promise<WP_EndpointResult<"kizlo.settings.authors.update">> {
		return this.wordpress.kizlo.settings.authors.update({ body: input })
	}

	public async updateCrawling(input: CrawlingSettingsInput): Promise<WP_EndpointResult<"kizlo.settings.crawling.update">> {
		return this.wordpress.kizlo.settings.crawling.update({ body: input })
	}

	public async updateUploads(input: UploadsSettingsInput): Promise<WP_EndpointResult<"kizlo.settings.uploads.update">> {
		return this.wordpress.kizlo.settings.uploads.update({ body: input })
	}

	public async updateHeadless(input: HeadlessSettingsInput): Promise<WP_EndpointResult<"kizlo.settings.headless.update">> {
		return this.wordpress.kizlo.settings.headless.update({ body: input })
	}

	public async updatePostType(key: string, input: PostTypeSettingsInput): Promise<WP_EndpointResult<"kizlo.settings.postTypes.update">> {
		return this.wordpress.kizlo.settings.postTypes.update({ params: { slug: key }, body: input })
	}

	public async updateTaxonomy(key: string, input: TaxonomySettingsInput): Promise<WP_EndpointResult<"kizlo.settings.taxonomies.update">> {
		return this.wordpress.kizlo.settings.taxonomies.update({ params: { slug: key }, body: input })
	}
}

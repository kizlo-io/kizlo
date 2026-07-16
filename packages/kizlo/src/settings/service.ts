import type { Service } from "../service"
import { WP_KIZLO_BASE } from "../wordpress"
import type {
	AuthorsSettingsInput,
	BrandSettingsInput,
	CrawlingSettingsInput,
	IdentitySettingsInput,
	PostTypeSettingsInput,
	Settings,
	SiteSettingsInput,
	TaxonomySettingsInput,
	UploadsSettingsInput,
	WebhookSettingsInput,
} from "./service.interface"

export class SettingsService {
	private readonly service: Service

	constructor(service: Service) {
		this.service = service
	}

	/** Fetch every Kizlo settings section in one response. */
	public async get() {
		return this.service.wordpress.get<Settings>("/settings", { base: WP_KIZLO_BASE })
	}

	public async updateSite(input: SiteSettingsInput) {
		return this.update("/settings/site", input)
	}

	public async updateBrand(input: BrandSettingsInput) {
		return this.update("/settings/brand", input)
	}

	public async updateWebhook(input: WebhookSettingsInput) {
		return this.update("/settings/webhook", input)
	}

	public async updateIdentity(input: IdentitySettingsInput) {
		return this.update("/settings/identity", input)
	}

	public async updateAuthors(input: AuthorsSettingsInput) {
		return this.update("/settings/authors", input)
	}

	public async updateCrawling(input: CrawlingSettingsInput) {
		return this.update("/settings/crawling", input)
	}

	public async updateUploads(input: UploadsSettingsInput) {
		return this.update("/settings/uploads", input)
	}

	public async updatePostType(slug: string, input: PostTypeSettingsInput) {
		return this.update(`/settings/post_types/${slug}`, input)
	}

	public async updateTaxonomy(slug: string, input: TaxonomySettingsInput) {
		return this.update(`/settings/taxonomies/${slug}`, input)
	}

	private async update(path: string, body: unknown) {
		return this.service.wordpress.put<null, "invalid_param">(path, { base: WP_KIZLO_BASE, body })
	}
}

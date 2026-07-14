import type { Service } from "../service"
import { WP_KIZLO_BASE } from "../wordpress"
import type {
	KizloAuthorsSettingsInput,
	KizloBrandSettingsInput,
	KizloCrawlingSettingsInput,
	KizloIdentitySettingsInput,
	KizloPostTypeSettingsInput,
	KizloSettings,
	KizloSiteSettingsInput,
	KizloTaxonomySettingsInput,
	KizloWebhookSettingsInput,
} from "./service.interface"

type KizloSettingsUpdateErrorCode = "invalid_param"

export class KizloSettingsService {
	private readonly service: Service

	constructor(service: Service) {
		this.service = service
	}

	/** Fetch every Kizlo settings section in one response. */
	public async get() {
		return this.service.wordpress.get<KizloSettings>("/settings", { base: WP_KIZLO_BASE })
	}

	public async updateSite(input: KizloSiteSettingsInput) {
		return this.update("/settings/site", input)
	}

	public async updateBrand(input: KizloBrandSettingsInput) {
		return this.update("/settings/brand", input)
	}

	public async updateWebhook(input: KizloWebhookSettingsInput) {
		return this.update("/settings/webhook", input)
	}

	public async updateIdentity(input: KizloIdentitySettingsInput) {
		return this.update("/settings/identity", input)
	}

	public async updateAuthors(input: KizloAuthorsSettingsInput) {
		return this.update("/settings/authors", input)
	}

	public async updateCrawling(input: KizloCrawlingSettingsInput) {
		return this.update("/settings/crawling", input)
	}

	public async updatePostType(slug: string, input: KizloPostTypeSettingsInput) {
		return this.update(`/settings/post_types/${slug}`, input)
	}

	public async updateTaxonomy(slug: string, input: KizloTaxonomySettingsInput) {
		return this.update(`/settings/taxonomies/${slug}`, input)
	}

	private async update(path: string, body: unknown) {
		return this.service.wordpress.put<null, KizloSettingsUpdateErrorCode>(path, { base: WP_KIZLO_BASE, body })
	}
}

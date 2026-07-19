import { trimLeadingTrailingSlashes } from "@kizlo/shared"
import type { Identifier } from "../shared/identifier"
import type { WordPressService } from "../wordpress"
import { WP_KIZLO_BASE } from "../wordpress"
import type {
	WPK_CreateTaxonomyInput,
	WPK_DeleteTaxonomyInput,
	WPK_Taxonomy,
	WPK_TaxonomyCreateErrorCode,
	WPK_TaxonomyDeleteErrorCode,
	WPK_TaxonomyListErrorCode,
	WPK_TaxonomyListInput,
	WPK_TaxonomyRetrieveErrorCode,
	WPK_TaxonomyUpdateErrorCode,
	WPK_UpdateTaxonomyInput,
} from "./service.interface"

export class TaxonomyService<T = WPK_Taxonomy> {
	private readonly key: string
	private readonly wordpress: WordPressService

	constructor(key: string, wordpress: WordPressService) {
		this.key = key
		this.wordpress = wordpress
	}

	public async get(identifier: Identifier) {
		return await this.wordpress.get<T, WPK_TaxonomyRetrieveErrorCode>(this.resolvePath(identifier), {
			base: WP_KIZLO_BASE,
		})
	}

	public async list(input: WPK_TaxonomyListInput) {
		return await this.wordpress.get<T[], WPK_TaxonomyListErrorCode>(this.resolvePath(), {
			base: WP_KIZLO_BASE,
			searchParams: { ...input },
		})
	}

	public async create(input: WPK_CreateTaxonomyInput) {
		return await this.wordpress.post<T, WPK_TaxonomyCreateErrorCode>(this.resolvePath(), {
			base: WP_KIZLO_BASE,
			body: input,
		})
	}

	public async update(input: WPK_UpdateTaxonomyInput) {
		return await this.wordpress.put<T, WPK_TaxonomyUpdateErrorCode>(this.resolvePath(input.identifier), {
			base: WP_KIZLO_BASE,
			body: input,
		})
	}

	public async delete(input: WPK_DeleteTaxonomyInput) {
		return await this.wordpress.delete<T, WPK_TaxonomyDeleteErrorCode>(this.resolvePath(input.identifier), {
			base: WP_KIZLO_BASE,
			searchParams: { force: input.force },
		})
	}

	private resolvePath(identifier?: Identifier) {
		return `/taxonomies/${trimLeadingTrailingSlashes(this.key)}${identifier ? `/${identifier.value}` : ``}`
	}
}

export function getTaxonomyService<T = WPK_Taxonomy>(key: string, wordpress: WordPressService) {
	return new TaxonomyService<T>(key, wordpress)
}

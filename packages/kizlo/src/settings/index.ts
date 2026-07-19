import type { ProcedureContext } from "../context"
import { createProcedure, type ProcedureErrors, schemaType } from "../shared/procedure"
import type { WP_Result } from "../wordpress"
import type { SettingsService } from "./service"
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

type SettingsUpdate<TData> =
	Awaited<ReturnType<SettingsService["updateSite"]>> extends WP_Result<unknown, infer TCode> ? WP_Result<TData, TCode> : never

/** Shared error handling for every settings write: `invalid_param` → 400, `rest_forbidden` → 403, anything else → 500. */
function resolveUpdate<TData>(response: SettingsUpdate<TData>, context: ProcedureContext, errors: ProcedureErrors, label: string): TData {
	if (response.error) {
		switch (response.error.code) {
			case "invalid_param":
				throw errors.BAD_REQUEST({ message: response.error.message })
			case "rest_forbidden":
				throw errors.FORBIDDEN({ message: response.error.message })
			default:
				context.logger.error(`${label} unhandled error`, response.error)
				throw errors.INTERNAL_SERVER_ERROR()
		}
	}

	return response.data
}

export const SETTINGS_ROUTER_MAP = {
	get: createProcedure({ scope: "internal", output: schemaType<Settings>() }, async ({ context, errors }) => {
		const response = await context.settings.get()

		if (response.error) {
			if (response.error.code === "rest_forbidden") throw errors.FORBIDDEN({ message: response.error.message })
			context.logger.error("Get settings unhandled error", response.error)
			throw errors.INTERNAL_SERVER_ERROR()
		}

		return response.data
	}),

	site: {
		update: createProcedure(
			{ scope: "internal", input: schemaType<SiteSettingsInput>(), output: schemaType<SiteSettings>() },
			async ({ context, input, errors }) =>
				resolveUpdate(await context.settings.updateSite(input), context, errors, "Update site settings"),
		),
	},

	brand: {
		update: createProcedure(
			{ scope: "internal", input: schemaType<BrandSettingsInput>(), output: schemaType<BrandSettings>() },
			async ({ context, input, errors }) =>
				resolveUpdate(await context.settings.updateBrand(input), context, errors, "Update brand settings"),
		),
	},

	identity: {
		update: createProcedure(
			{ scope: "internal", input: schemaType<IdentitySettingsInput>(), output: schemaType<IdentitySettings>() },
			async ({ context, input, errors }) =>
				resolveUpdate(await context.settings.updateIdentity(input), context, errors, "Update identity settings"),
		),
	},

	authors: {
		update: createProcedure(
			{ scope: "internal", input: schemaType<AuthorsSettingsInput>(), output: schemaType<AuthorsSettings>() },
			async ({ context, input, errors }) =>
				resolveUpdate(await context.settings.updateAuthors(input), context, errors, "Update authors settings"),
		),
	},

	crawling: {
		update: createProcedure(
			{ scope: "internal", input: schemaType<CrawlingSettingsInput>(), output: schemaType<CrawlingSettings>() },
			async ({ context, input, errors }) =>
				resolveUpdate(await context.settings.updateCrawling(input), context, errors, "Update crawling settings"),
		),
	},

	webhook: {
		update: createProcedure(
			{ scope: "internal", input: schemaType<WebhookSettingsInput>(), output: schemaType<WebhookSettings>() },
			async ({ context, input, errors }) =>
				resolveUpdate(await context.settings.updateWebhook(input), context, errors, "Update webhook settings"),
		),
	},

	uploads: {
		update: createProcedure(
			{ scope: "internal", input: schemaType<UploadsSettingsInput>(), output: schemaType<UploadsSettings>() },
			async ({ context, input, errors }) =>
				resolveUpdate(await context.settings.updateUploads(input), context, errors, "Update uploads settings"),
		),
	},

	postType: {
		update: createProcedure(
			{ scope: "internal", input: schemaType<{ key: string; data: PostTypeSettingsInput }>(), output: schemaType<PostTypeSettings>() },
			async ({ context, input, errors }) =>
				resolveUpdate(await context.settings.updatePostType(input.key, input.data), context, errors, "Update post type settings"),
		),
	},

	taxonomy: {
		update: createProcedure(
			{ scope: "internal", input: schemaType<{ key: string; data: TaxonomySettingsInput }>(), output: schemaType<TaxonomySettings>() },
			async ({ context, input, errors }) =>
				resolveUpdate(await context.settings.updateTaxonomy(input.key, input.data), context, errors, "Update taxonomy settings"),
		),
	},
}

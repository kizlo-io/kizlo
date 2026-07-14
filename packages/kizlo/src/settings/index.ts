import type { ServerContext } from "../context"
import { createProcedure, type ProcedureErrors, schemaType } from "../shared/procedure"
import type { KizloSettingsService } from "./service"
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

// Settings procedures are `internal` scope: exposed on the server client
// (`client.settings.*`) but dropped from the browser client, since the payload
// carries the site secret and backend config. They wrap the same
// KizloSettingsService reachable at `context.service.settings`.

type SettingsUpdate = Awaited<ReturnType<KizloSettingsService["updateSite"]>>

/** Shared error handling for every settings write: `invalid_param` → 400, anything else → 500. */
function resolveUpdate(response: SettingsUpdate, context: ServerContext, errors: ProcedureErrors, label: string): null {
	if (response.error) {
		if (response.error.code === "invalid_param") throw errors.BAD_REQUEST({ message: response.error.message })
		context.logger.error(`${label} unhandled error`, response.error)
		throw errors.INTERNAL_SERVER_ERROR()
	}

	return response.data
}

export const SETTINGS_ROUTER_MAP = {
	get: createProcedure({ scope: "internal", output: schemaType<KizloSettings>() }, async ({ context, errors }) => {
		const response = await context.service.settings.get()

		if (response.error) {
			context.logger.error("Get settings unhandled error", response.error)
			throw errors.INTERNAL_SERVER_ERROR()
		}

		return response.data
	}),

	updateSite: createProcedure(
		{ scope: "internal", input: schemaType<KizloSiteSettingsInput>(), output: schemaType<null>() },
		async ({ context, input, errors }) =>
			resolveUpdate(await context.service.settings.updateSite(input), context, errors, "Update site settings"),
	),

	updateBrand: createProcedure(
		{ scope: "internal", input: schemaType<KizloBrandSettingsInput>(), output: schemaType<null>() },
		async ({ context, input, errors }) =>
			resolveUpdate(await context.service.settings.updateBrand(input), context, errors, "Update brand settings"),
	),

	updateIdentity: createProcedure(
		{ scope: "internal", input: schemaType<KizloIdentitySettingsInput>(), output: schemaType<null>() },
		async ({ context, input, errors }) =>
			resolveUpdate(await context.service.settings.updateIdentity(input), context, errors, "Update identity settings"),
	),

	updateAuthors: createProcedure(
		{ scope: "internal", input: schemaType<KizloAuthorsSettingsInput>(), output: schemaType<null>() },
		async ({ context, input, errors }) =>
			resolveUpdate(await context.service.settings.updateAuthors(input), context, errors, "Update authors settings"),
	),

	updateCrawling: createProcedure(
		{ scope: "internal", input: schemaType<KizloCrawlingSettingsInput>(), output: schemaType<null>() },
		async ({ context, input, errors }) =>
			resolveUpdate(await context.service.settings.updateCrawling(input), context, errors, "Update crawling settings"),
	),

	updateWebhook: createProcedure(
		{ scope: "internal", input: schemaType<KizloWebhookSettingsInput>(), output: schemaType<null>() },
		async ({ context, input, errors }) =>
			resolveUpdate(await context.service.settings.updateWebhook(input), context, errors, "Update webhook settings"),
	),

	updatePostType: createProcedure(
		{ scope: "internal", input: schemaType<{ slug: string; data: KizloPostTypeSettingsInput }>(), output: schemaType<null>() },
		async ({ context, input, errors }) =>
			resolveUpdate(await context.service.settings.updatePostType(input.slug, input.data), context, errors, "Update post type settings"),
	),

	updateTaxonomy: createProcedure(
		{ scope: "internal", input: schemaType<{ slug: string; data: KizloTaxonomySettingsInput }>(), output: schemaType<null>() },
		async ({ context, input, errors }) =>
			resolveUpdate(await context.service.settings.updateTaxonomy(input.slug, input.data), context, errors, "Update taxonomy settings"),
	),
}

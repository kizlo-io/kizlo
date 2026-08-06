import type { CustomFieldDefinition } from "@kizlo/shared"

declare global {
	interface Window {
		/** Content-form payload handed to the custom-fields React root by the PHP metabox / term form. */
		kizloCustomFields?: {
			definitions: CustomFieldDefinition[]
			values: Record<string, unknown>
		}
	}
}

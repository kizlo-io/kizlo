import type { Control, FieldPath, FieldValues } from "react-hook-form"
import { SwitchField } from "@/shared/components/fields"
import { SettingsSection } from "@/shared/components/settings"
import { SECTION_REST_API } from "../nav-model"
import type { getContent } from "./content"

type AccessContent = ReturnType<typeof getContent>["access"]

interface RestApiSectionProps<TInput extends FieldValues, TOutput extends FieldValues> {
	control: Control<TInput, unknown, TOutput>
	access: AccessContent
	internal: boolean
}

export function RestApiSection<TInput extends FieldValues & { rest_api_enabled: boolean }, TOutput extends FieldValues>({
	control,
	access,
	internal,
}: RestApiSectionProps<TInput, TOutput>) {
	if (internal) return null

	return (
		<SettingsSection id={SECTION_REST_API} title={access.heading} desc={access.description}>
			<SwitchField
				control={control}
				name={"rest_api_enabled" as FieldPath<TInput>}
				label={access.enabled.label}
				description={access.enabled.description}
			/>
		</SettingsSection>
	)
}

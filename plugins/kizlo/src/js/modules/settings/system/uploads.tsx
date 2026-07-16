import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { ComboboxField } from "@/shared/components/fields"
import { SettingsForm, SettingsSection } from "@/shared/components/settings"
import { type UploadsSettingsInput, type UploadsSettingsOutput, UploadsSettingsSchema } from "@/shared/lib/schema"
import { useSettings, useSettingsForm } from "@/shared/lib/settings"

export function UploadsSettingsPage() {
	const { settings } = useSettings()

	const options = (settings?.constants.uploads.supported_mimes ?? []).map((mime) => ({
		label: `${mime.label} (${mime.mime})`,
		value: mime.value,
	}))

	const form = useForm<UploadsSettingsInput, unknown, UploadsSettingsOutput>({
		resolver: zodResolver(UploadsSettingsSchema),
		defaultValues: {
			allowed_mimes: settings?.uploads.allowed_mimes ?? [],
		},
	})

	return (
		<SettingsForm {...useSettingsForm("uploads", form)}>
			<SettingsSection
				title="Allowed File Types"
				desc="Let editors upload file types that WordPress blocks by default, such as SVG logos and ICO favicons. Uploaded SVGs are automatically sanitized to remove scripts and other unsafe content."
			>
				<ComboboxField
					multiple
					control={form.control}
					name="allowed_mimes"
					label="Upload Types"
					options={options}
					placeholder="Select file types..."
					description="Only the types selected here are added to the media library's allow list."
				/>
			</SettingsSection>
		</SettingsForm>
	)
}

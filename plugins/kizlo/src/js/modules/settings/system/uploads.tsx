import { zodResolver } from "@hookform/resolvers/zod"
import { PlusIcon, TrashIcon } from "@phosphor-icons/react"
import { Controller, useFieldArray, useForm } from "react-hook-form"
import { FieldError } from "@/shared/components/fields"
import { SettingsForm, SettingsSection } from "@/shared/components/settings"
import { Button } from "@/shared/components/ui/button"
import { TextInput } from "@/shared/components/ui/input"
import { type UploadsSettingsInput, type UploadsSettingsOutput, UploadsSettingsSchema } from "@/shared/lib/schema"
import { useSettings, useSettingsForm } from "@/shared/lib/settings"
import { sectionsFor } from "../nav-model"

const S = sectionsFor("system/uploads")

export function UploadsSettingsPage() {
	const { settings } = useSettings()

	const form = useForm<UploadsSettingsInput, unknown, UploadsSettingsOutput>({
		resolver: zodResolver(UploadsSettingsSchema),
		defaultValues: {
			allowed_mimes: settings?.uploads.allowed_mimes ?? [],
		},
	})

	const { fields, append, remove } = useFieldArray({ control: form.control, name: "allowed_mimes" })

	return (
		<SettingsForm {...useSettingsForm("uploads", form)}>
			<SettingsSection {...S("allowed-file-types")}>
				<div className="flex flex-col gap-3">
					{fields.length > 0 && (
						<div className="flex items-center gap-2 text-muted-foreground text-sm">
							<span className="w-32">Extension</span>
							<span className="flex-1">MIME type</span>
							<span className="w-9" />
						</div>
					)}

					{fields.map((item, index) => (
						<div key={item.id} className="flex items-start gap-2">
							<Controller
								name={`allowed_mimes.${index}.ext`}
								control={form.control}
								render={({ field, fieldState }) => (
									<div className="w-32">
										<TextInput name={field.name} placeholder="svg" value={field.value ?? ""} onChange={field.onChange} />
										<FieldError message={fieldState.error?.message} />
									</div>
								)}
							/>

							<Controller
								name={`allowed_mimes.${index}.mime`}
								control={form.control}
								render={({ field, fieldState }) => (
									<div className="flex-1">
										<TextInput name={field.name} placeholder="image/svg+xml" value={field.value ?? ""} onChange={field.onChange} />
										<FieldError message={fieldState.error?.message} />
									</div>
								)}
							/>

							<Button type="button" variant="ghost" onClick={() => remove(index)} aria-label="Remove file type">
								<TrashIcon />
							</Button>
						</div>
					))}

					<Button type="button" variant="secondary" size="sm" onClick={() => append({ ext: "", mime: "" })}>
						<PlusIcon />
						Add File Type
					</Button>
				</div>
			</SettingsSection>
		</SettingsForm>
	)
}

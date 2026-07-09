import { zodResolver } from "@hookform/resolvers/zod"
import { PlusIcon, TrashIcon } from "@phosphor-icons/react"
import { Controller, useFieldArray, useForm } from "react-hook-form"
import { ComboboxField } from "@/shared/components/fields"
import { SettingsForm, SettingsSection } from "@/shared/components/settings"
import { Button } from "@/shared/components/ui/button"
import { TextInput } from "@/shared/components/ui/input"
import { type WebhookSettingsInput, type WebhookSettingsOutput, WebhookSettingsSchema } from "@/shared/lib/schema"
import { useSettings } from "@/shared/lib/settings"

export function WebhookSettingsPage() {
	const { settings, update, isLoading } = useSettings()

	const form = useForm<WebhookSettingsInput, unknown, WebhookSettingsOutput>({
		resolver: zodResolver(WebhookSettingsSchema),
		defaultValues: {
			post_types: settings?.webhook.post_types ?? [],
			taxonomies: settings?.webhook.taxonomies ?? [],
			webhook_urls: settings?.webhook.webhook_urls ?? [],
		},
	})

	const { fields, append, remove } = useFieldArray({ control: form.control, name: "webhook_urls" as never })

	async function onSubmit(data: WebhookSettingsOutput) {
		await update("webhook", data)
		form.reset(form.getValues())
	}

	return (
		<SettingsForm
			isLoading={isLoading}
			isDirty={form.formState.isDirty}
			onSubmit={form.handleSubmit(onSubmit)}
			onCancel={() => form.reset()}
		>
			<SettingsSection
				title="Webhook URLs"
				desc="One or more endpoints that will receive a POST request when triggered content changes. Each URL must be publicly accessible."
			>
				<div className="flex flex-col gap-3">
					{fields.map((item, index) => (
						<div key={item.id} className="flex items-center gap-2">
							<Controller
								name={`webhook_urls.${index}` as never}
								control={form.control}
								render={({ field }) => (
									<TextInput
										name={field.name}
										placeholder="https://yoursite.com/api/webhook"
										value={field.value ?? ""}
										onChange={field.onChange}
										className="flex-1"
									/>
								)}
							/>

							<Button type="button" variant="ghost" onClick={() => remove(index)} aria-label="Remove URL">
								<TrashIcon />
							</Button>
						</div>
					))}

					<Button type="button" variant="secondary" size="sm" onClick={() => append("" as never)}>
						<PlusIcon />
						Add Webhook URL
					</Button>
				</div>
			</SettingsSection>

			<SettingsSection
				title="Triggers"
				desc="Choose which post types and taxonomies cause a webhook to fire when their content is created, updated, or deleted."
			>
				<ComboboxField
					multiple
					control={form.control}
					name="post_types"
					label="Post Types"
					options={settings?.post_types.map((item) => ({ label: item.name, value: item.slug })) ?? []}
					placeholder="Select post types..."
					description="The webhook fires whenever a post of these types is saved or deleted."
				/>

				<ComboboxField
					multiple
					control={form.control}
					name="taxonomies"
					label="Taxonomies"
					options={settings?.taxonomies.map((item) => ({ label: item.name, value: item.slug })) ?? []}
					placeholder="Select taxonomies..."
					description="The webhook also fires when terms in these taxonomies are created or updated."
				/>
			</SettingsSection>
		</SettingsForm>
	)
}

import { zodResolver } from "@hookform/resolvers/zod"
import { GlobeIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { Controller, useFieldArray, useForm } from "react-hook-form"

import { ComboboxField } from "@/modules/settings/shared/fields"
import { SettingsGroup, SettingsSet } from "@/modules/settings/shared/settings"
import { type WebhookSettingsInput, type WebhookSettingsOutput, WebhookSettingsSchema } from "@/shared/lib/schema"
import { useSettings } from "@/shared/lib/settings"
import { Button } from "@/shared/ui/button"
import { Card, CardContent } from "@/shared/ui/card"
import { Field, FieldError, FieldGroup, FieldSeparator } from "@/shared/ui/field"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/shared/ui/input-group"

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

	function onSubmit(data: WebhookSettingsOutput) {
		update("webhook", data)
	}

	return (
		<form onSubmit={form.handleSubmit(onSubmit)} className="relative">
			<SettingsSet isLoading={isLoading}>
				{/* ── Webhook URLs ── */}
				<SettingsGroup
					heading={<>Webhook URLs</>}
					description={
						<>
							One or more endpoints that will receive a POST request when triggered content changes. Each URL must be publicly accessible.
						</>
					}
				>
					<Card>
						<CardContent>
							<FieldGroup>
								{fields.map((item, index) => (
									<Controller
										key={item.id}
										name={`webhook_urls.${index}` as never}
										control={form.control}
										render={({ field, fieldState }) => (
											<Field data-invalid={fieldState.invalid}>
												<InputGroup>
													<InputGroupAddon align="inline-start">
														<GlobeIcon />
													</InputGroupAddon>
													<InputGroupInput
														{...field}
														value={field.value}
														onChange={field.onChange}
														aria-invalid={fieldState.invalid}
														placeholder="https://yoursite.com/api/webhook"
													/>
													<InputGroupAddon align="inline-end">
														<InputGroupButton
															type="button"
															variant="ghost"
															size="icon-xs"
															onClick={() => remove(index)}
															aria-label="Remove URL"
														>
															<Trash2Icon />
														</InputGroupButton>
													</InputGroupAddon>
												</InputGroup>
												{fieldState.invalid && <FieldError errors={[fieldState.error]} />}
											</Field>
										)}
									/>
								))}

								<Button type="button" variant="outline" size="sm" onClick={() => append("" as never)}>
									<PlusIcon />
									Add Webhook URL
								</Button>
							</FieldGroup>
						</CardContent>
					</Card>
				</SettingsGroup>

				<FieldSeparator />

				{/* ── Triggers ── */}
				<SettingsGroup
					heading={<>Triggers</>}
					description={
						<>
							Choose which post types and taxonomies cause a webhook to fire when their content is created, updated, or deleted.
						</>
					}
				>
					<Card>
						<CardContent>
							<FieldGroup>
								<ComboboxField
									multiple
									control={form.control}
									name="post_types"
									label="Post Types"
									options={settings?.post_types.map((item) => ({ label: item.name, value: item.slug })) ?? []}
									placeholder="Select post types..."
									searchPlaceholder="Search post types..."
									description="The webhook fires whenever a post of these types is saved or deleted."
								/>

								<ComboboxField
									multiple
									control={form.control}
									name="taxonomies"
									label="Taxonomies"
									options={settings?.taxonomies.map((item) => ({ label: item.name, value: item.slug })) ?? []}
									placeholder="Select taxonomies..."
									searchPlaceholder="Search taxonomies..."
									description="The webhook also fires when terms in these taxonomies are created or updated."
								/>
							</FieldGroup>
						</CardContent>
					</Card>
				</SettingsGroup>
			</SettingsSet>
		</form>
	)
}

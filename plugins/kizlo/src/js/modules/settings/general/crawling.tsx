import { zodResolver } from "@hookform/resolvers/zod"
import { PlusIcon, XIcon } from "@phosphor-icons/react"
import { Controller, useFieldArray, useForm } from "react-hook-form"
import { SwitchField } from "@/shared/components/fields"
import { SettingsForm, SettingsSection } from "@/shared/components/settings"
import { Button } from "@/shared/components/ui/button"
import { TextInput } from "@/shared/components/ui/input"
import { Select } from "@/shared/components/ui/select"
import { type CrawlingSettingsInput, type CrawlingSettingsOutput, CrawlingSettingsSchema } from "@/shared/lib/schema"
import { useSettings, useSettingsForm } from "@/shared/lib/settings"

const RULE_OPTIONS = [
	{ label: "Allow", value: "allow" },
	{ label: "Disallow", value: "disallow" },
]

export function CrawlingSettingsPage() {
	const { settings } = useSettings()

	const form = useForm<CrawlingSettingsInput, unknown, CrawlingSettingsOutput>({
		resolver: zodResolver(CrawlingSettingsSchema),
		defaultValues: {
			robots: {
				include_sitemap: settings?.crawling.robots.include_sitemap ?? true,
				custom_rules: settings?.crawling.robots.custom_rules ?? [],
			},
		},
	})

	const { fields, append, remove } = useFieldArray({
		control: form.control,
		name: "robots.custom_rules",
	})

	return (
		<SettingsForm {...useSettingsForm("crawling", form)}>
			<SettingsSection title="Sitemap" desc="Control how your sitemap is exposed to search engines.">
				<SwitchField
					control={form.control}
					name="robots.include_sitemap"
					label="Include Sitemap"
					description="Automatically append your sitemap URL to the robots.txt output."
				/>
			</SettingsSection>

			<SettingsSection
				title="Robots"
				desc="Control how search engines crawl your site. These settings are used to generate your robots.txt data."
			>
				<div className="flex flex-col gap-4">
					{fields.map((item, index) => (
						<div key={item.id} className="flex flex-col gap-2 border-neutral-200 border-b pb-4 sm:flex-row sm:items-end">
							<Controller
								name={`robots.custom_rules.${index}.user_agent`}
								control={form.control}
								render={({ field }) => (
									<TextInput
										name={field.name}
										label="User Agent"
										placeholder="*"
										value={field.value ?? ""}
										onChange={field.onChange}
										className="sm:flex-1"
									/>
								)}
							/>

							<Controller
								name={`robots.custom_rules.${index}.rule`}
								control={form.control}
								render={({ field }) => (
									<Select
										name={field.name}
										label="Rule"
										options={RULE_OPTIONS}
										value={field.value ?? ""}
										onChange={field.onChange}
										className="w-full sm:w-36"
									/>
								)}
							/>

							<div className="flex items-end gap-2 sm:contents">
								<Controller
									name={`robots.custom_rules.${index}.path`}
									control={form.control}
									render={({ field }) => (
										<TextInput
											name={field.name}
											label="Path"
											placeholder="/wp-admin/"
											value={field.value ?? ""}
											onChange={field.onChange}
											className="flex-1"
										/>
									)}
								/>

								<Button
									type="button"
									variant="secondary"
									size="sm"
									onClick={() => remove(index)}
									aria-label="Remove rule"
									className="mb-0.5"
								>
									<XIcon />
								</Button>
							</div>
						</div>
					))}

					<Button type="button" variant="secondary" size="sm" onClick={() => append({ user_agent: "", rule: "disallow", path: "" })}>
						<PlusIcon />
						Add Rule
					</Button>
				</div>
			</SettingsSection>
		</SettingsForm>
	)
}

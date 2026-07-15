import { zodResolver } from "@hookform/resolvers/zod"
import { BuildingsIcon, PlusIcon, UserIcon, XIcon } from "@phosphor-icons/react"
import { type Control, Controller, type FieldPath, useFieldArray, useForm } from "react-hook-form"
import { ComboboxField, FieldError, NumberInputField, TextareaInputField, TextInputField } from "@/shared/components/fields"
import { SettingsForm, SettingsSection } from "@/shared/components/settings"
import { Button } from "@/shared/components/ui/button"
import { TextInput } from "@/shared/components/ui/input"
import { MediaPicker } from "@/shared/components/ui/media-picker"
import { type RadioCardOption, RadioCards } from "@/shared/components/ui/radio"
import { useUsers } from "@/shared/hooks/use-users"
import { type IdentitySettingsInput, type IdentitySettingsOutput, IdentitySettingsSchema } from "@/shared/lib/schema"
import { useSettings } from "@/shared/lib/settings"

const IDENTITY_OPTIONS: RadioCardOption[] = [
	{ value: "person", label: "Person", desc: "A personal brand, blogger, freelancer, or individual creator.", icon: UserIcon },
	{ value: "organization", label: "Organization", desc: "A company, nonprofit, agency, or any structured entity.", icon: BuildingsIcon },
]

export function IdentitySettingsPage() {
	const { settings, update, isLoading } = useSettings()
	const users = useUsers()
	const userOptions = users.map((user) => ({ value: String(user.id), label: user.name }))

	const form = useForm<IdentitySettingsInput, unknown, IdentitySettingsOutput>({
		defaultValues: {
			type: settings?.identity.type ?? "organization",
			person: {
				user_id: settings?.identity.person?.user_id != null ? String(settings.identity.person.user_id) : "",
				image: settings?.identity.person?.image?.id ?? null,
				social_profiles: [...(settings?.identity.person?.social_profiles ?? [])],
			},
			organization: {
				name: settings?.identity.organization?.name ?? "",
				alternate_name: settings?.identity.organization?.alternate_name ?? "",
				description: settings?.identity.organization?.description ?? "",
				email: settings?.identity.organization?.email ?? "",
				employees_min: settings?.identity.organization?.employees_min ?? 0,
				employees_max: settings?.identity.organization?.employees_max ?? 0,
				founder: {
					name: settings?.identity.organization?.founder?.name ?? "",
					social_profiles: [...(settings?.identity.organization?.founder?.social_profiles ?? [])],
				},
				founding_date: settings?.identity.organization?.founding_date ?? "",
				legal_name: settings?.identity.organization?.legal_name ?? "",
				logo: settings?.identity.organization?.logo?.id ?? null,
				phone: settings?.identity.organization?.phone ?? "",
				slogan: settings?.identity.organization?.slogan ?? "",
				social_profiles: [...(settings?.identity.organization?.social_profiles ?? [])],
				vat_id: settings?.identity.organization?.vat_id ?? "",
				tax_id: settings?.identity.organization?.tax_id ?? "",
				iso6523_code: settings?.identity.organization?.iso6523_code ?? "",
				duns: settings?.identity.organization?.duns ?? "",
				lei_code: settings?.identity.organization?.lei_code ?? "",
				naics: settings?.identity.organization?.naics ?? "",
				publishing_principles: settings?.identity.organization?.publishing_principles ?? "",
				ownership_funding_info: settings?.identity.organization?.ownership_funding_info ?? "",
				actionable_feedback_policy: settings?.identity.organization?.actionable_feedback_policy ?? "",
				corrections_policy: settings?.identity.organization?.corrections_policy ?? "",
				ethics_policy: settings?.identity.organization?.ethics_policy ?? "",
				diversity_policy: settings?.identity.organization?.diversity_policy ?? "",
				diversity_staffing_report: settings?.identity.organization?.diversity_staffing_report ?? "",
			},
		},
		resolver: zodResolver(IdentitySettingsSchema),
	})

	const identityType = form.watch("type")

	async function onSubmit(data: IdentitySettingsOutput) {
		await update("identity", data)
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
				title="Identity"
				desc="Select whether this site represents a person or an organization. This determines which structured data (Schema.org) Kizlo outputs and which fields are shown below."
			>
				<Controller
					name="type"
					control={form.control}
					render={({ field }) => <RadioCards name="type" options={IDENTITY_OPTIONS} value={field.value} onChange={field.onChange} />}
				/>
			</SettingsSection>

			{identityType === "person" ? (
				<SettingsSection
					title="Person"
					desc="Details about the individual behind this site. Used in Schema.org Person structured data and author metadata across your posts."
				>
					<ComboboxField
						control={form.control}
						name="person.user_id"
						label="User"
						options={userOptions}
						placeholder="Select a user"
						description="The WordPress user this site represents. Their name and profile drive the Schema.org Person data, and their posts merge into this same identity."
					/>

					<Controller
						name="person.image"
						control={form.control}
						render={({ field }) => (
							<MediaPicker
								type="image"
								label="Profile Photo"
								desc={
									<>
										Used in Schema.org Person markup and as the author avatar. Recommended: square image, at least{" "}
										<strong>400 × 400 px</strong>.
									</>
								}
								url={settings?.identity.person?.image?.src}
								value={typeof field.value === "number" ? field.value : null}
								onValueChange={(item) => field.onChange(item?.id ?? null)}
							/>
						)}
					/>

					<SocialProfilesField
						control={form.control}
						name="person.social_profiles"
						legend="Social Profiles"
						description="Links to the person's social media profiles. Added to Schema.org structured data to help Google associate this site with social accounts."
					/>
				</SettingsSection>
			) : null}

			{identityType === "organization" ? (
				<>
					<SettingsSection
						title="Organization"
						desc="Core details about your organization. Used in Schema.org Organization structured data across your site."
					>
						<TextInputField
							control={form.control}
							name="organization.name"
							label="Organization Name"
							placeholder="Acme Inc."
							description="The official public-facing name of your organization."
						/>

						<TextInputField
							control={form.control}
							name="organization.alternate_name"
							label="Alternate Name"
							placeholder="Acme"
							description="A shorter or alternate name (e.g. acronym or brand nickname). Added to the alternateName field in structured data."
						/>

						<TextInputField
							control={form.control}
							name="organization.slogan"
							label="Slogan"
							placeholder="Building tools people love"
							description="Your organization's tagline or motto. Maps to the Schema.org sameAs slogan field."
						/>

						<TextareaInputField
							control={form.control}
							name="organization.description"
							label="Description"
							placeholder="We build fast, reliable WordPress plugins..."
							description="A short description of what your organization does. Used in structured data and as a meta description fallback."
						/>

						<SocialProfilesField
							control={form.control}
							name="organization.social_profiles"
							legend="Organization Social Profiles"
							description="Official social media profiles for your organization. Added to Schema.org structured data to help Google associate your brand across platforms."
						/>

						<Controller
							name="organization.logo"
							control={form.control}
							render={({ field }) => (
								<MediaPicker
									type="image"
									label="Logo"
									desc={
										<>
											Recommended: transparent PNG or SVG, <strong>600 × 200 px</strong> minimum. Google requires logos to be between 160px
											and 1920px wide.
										</>
									}
									url={settings?.identity.organization?.logo?.src}
									value={typeof field.value === "number" ? field.value : null}
									onValueChange={(item) => field.onChange(item?.id ?? null)}
								/>
							)}
						/>
					</SettingsSection>

					<SettingsSection
						title="Contact & Legal"
						desc="Contact details and legal information. These help search engines and knowledge panels display accurate business info."
					>
						<TextInputField
							control={form.control}
							name="organization.email"
							label="Email"
							placeholder="hello@acme.com"
							description="A public contact email address for your organization."
						/>

						<TextInputField
							control={form.control}
							name="organization.phone"
							label="Phone"
							placeholder="+1 (555) 000-0000"
							description="A public phone number in international format (e.g. +1 555 000 0000)."
						/>

						<TextInputField
							control={form.control}
							name="organization.legal_name"
							label="Legal Name"
							placeholder="Acme Incorporated"
							description="The registered legal name of your organization if different from the display name. Maps to Schema.org legalName."
						/>

						<TextInputField
							control={form.control}
							name="organization.founding_date"
							label="Founding Date"
							placeholder="2018-04-01"
							description="The date your organization was founded in YYYY-MM-DD format. Maps to Schema.org foundingDate."
						/>

						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<NumberInputField
								name="organization.employees_min"
								control={form.control}
								label="Employees (min)"
								description="Lower bound of your employee count. Maps to Schema.org numberOfEmployees as a range."
							/>

							<NumberInputField
								name="organization.employees_max"
								control={form.control}
								label="Employees (max)"
								description="Upper bound of your employee count. Leave both at 0 to omit."
							/>
						</div>
					</SettingsSection>

					<SettingsSection
						title="Founder"
						desc="Optionally attribute the organization to a founder. Maps to Schema.org founder and helps Google associate the brand with an individual."
					>
						<TextInputField
							control={form.control}
							name="organization.founder.name"
							label="Founder Name"
							placeholder="Jane Smith"
							description="Full name of the organization's founder."
						/>

						<SocialProfilesField
							control={form.control}
							name="organization.founder.social_profiles"
							legend="Founder Social Profiles"
							description="Social profiles for the founder. Helps search engines link the founder's online presence to your organization."
						/>
					</SettingsSection>

					<SettingsSection
						title="Business Identifiers"
						desc="Registry and tax identifiers. Optional; fill in only what applies to your organization. Each maps to the matching Schema.org property."
					>
						<TextInputField
							control={form.control}
							name="organization.vat_id"
							label="VAT ID"
							placeholder="GB123456789"
							description="Value Added Tax identification number. Maps to Schema.org vatID."
						/>

						<TextInputField
							control={form.control}
							name="organization.tax_id"
							label="Tax ID"
							placeholder="12-3456789"
							description="Tax / fiscal identification number. Maps to Schema.org taxID."
						/>

						<TextInputField
							control={form.control}
							name="organization.iso6523_code"
							label="ISO 6523 Code"
							placeholder="0060:123456789"
							description="ISO 6523 organization identifier. Maps to Schema.org iso6523Code."
						/>

						<TextInputField
							control={form.control}
							name="organization.duns"
							label="DUNS"
							placeholder="150483782"
							description="Dun & Bradstreet D-U-N-S number. Maps to Schema.org duns."
						/>

						<TextInputField
							control={form.control}
							name="organization.lei_code"
							label="LEI Code"
							placeholder="529900T8BM49AURSDO55"
							description="Legal Entity Identifier (ISO 17442). Maps to Schema.org leiCode."
						/>

						<TextInputField
							control={form.control}
							name="organization.naics"
							label="NAICS Code"
							placeholder="511210"
							description="North American Industry Classification System code. Maps to Schema.org naics."
						/>
					</SettingsSection>

					<SettingsSection
						title="Publishing & Policies"
						desc="Policy page URLs used mainly by publishers and news sites. Each maps to the matching Schema.org property and helps Google understand your editorial standards."
					>
						<TextInputField
							control={form.control}
							name="organization.publishing_principles"
							label="Publishing Principles"
							placeholder="https://example.com/publishing-principles/"
							description="URL of the document describing your publishing principles. Maps to Schema.org publishingPrinciples."
						/>

						<TextInputField
							control={form.control}
							name="organization.ownership_funding_info"
							label="Ownership & Funding Info"
							placeholder="https://example.com/ownership-funding/"
							description="URL describing ownership structure and funding. Maps to Schema.org ownershipFundingInfo."
						/>

						<TextInputField
							control={form.control}
							name="organization.actionable_feedback_policy"
							label="Actionable Feedback Policy"
							placeholder="https://example.com/feedback-policy/"
							description="URL of your actionable feedback policy. Maps to Schema.org actionableFeedbackPolicy."
						/>

						<TextInputField
							control={form.control}
							name="organization.corrections_policy"
							label="Corrections Policy"
							placeholder="https://example.com/corrections-policy/"
							description="URL of your corrections policy. Maps to Schema.org correctionsPolicy."
						/>

						<TextInputField
							control={form.control}
							name="organization.ethics_policy"
							label="Ethics Policy"
							placeholder="https://example.com/ethics-policy/"
							description="URL of your ethics policy. Maps to Schema.org ethicsPolicy."
						/>

						<TextInputField
							control={form.control}
							name="organization.diversity_policy"
							label="Diversity Policy"
							placeholder="https://example.com/diversity-policy/"
							description="URL of your diversity policy. Maps to Schema.org diversityPolicy."
						/>

						<TextInputField
							control={form.control}
							name="organization.diversity_staffing_report"
							label="Diversity Staffing Report"
							placeholder="https://example.com/diversity-report/"
							description="URL of your diversity staffing report. Maps to Schema.org diversityStaffingReport."
						/>
					</SettingsSection>
				</>
			) : null}
		</SettingsForm>
	)
}

interface SocialProfilesFieldProps {
	control: Control<IdentitySettingsInput, unknown, IdentitySettingsOutput>
	name: FieldPath<IdentitySettingsInput>
	legend: string
	description: string
}

function SocialProfilesField({ control, name, legend, description }: SocialProfilesFieldProps) {
	const { fields, append, remove } = useFieldArray({ control, name: name as never })

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-col gap-1">
				<span className="font-medium text-neutral-900 text-sm">{legend}</span>
				<p className="my-0 text-neutral-500 text-sm leading-relaxed">{description}</p>
			</div>

			<div className="flex flex-col gap-2">
				{fields.map((item, index) => (
					<Controller
						key={item.id}
						name={`${name}.${index}` as never}
						control={control}
						render={({ field, fieldState }) => {
							const value = field.value as { platform?: string; url?: string }

							return (
								<div className="border-neutral-200 border-b pb-4">
									<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
										<TextInput
											name={`${field.name}.platform`}
											placeholder="Platform"
											value={value?.platform ?? ""}
											onChange={(platform) => field.onChange({ ...value, platform })}
											className="w-full sm:w-40"
										/>
										<div className="flex items-center gap-2 sm:contents">
											<TextInput
												name={`${field.name}.url`}
												placeholder="https://..."
												value={value?.url ?? ""}
												onChange={(url) => field.onChange({ ...value, url })}
												className="flex-1"
											/>
											<Button type="button" variant="secondary" onClick={() => remove(index)} aria-label="Remove profile">
												<XIcon />
											</Button>
										</div>
									</div>
									<FieldError message={fieldState.error?.message} />
								</div>
							)
						}}
					/>
				))}

				<Button type="button" variant="secondary" size="sm" onClick={() => append({ platform: "", url: "" } as never)}>
					<PlusIcon />
					Add Platform
				</Button>
			</div>
		</div>
	)
}

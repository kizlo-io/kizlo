import { zodResolver } from "@hookform/resolvers/zod"
import { BuildingsIcon, PlusIcon, TrashIcon, UserIcon } from "@phosphor-icons/react"
import { type Control, Controller, type FieldPath, useFieldArray, useForm } from "react-hook-form"
import { FieldError, NumberInputField, TextInputField } from "@/shared/components/fields"
import { SettingsForm, SettingsSection } from "@/shared/components/settings"
import { Button } from "@/shared/components/ui/button"
import { TextInput } from "@/shared/components/ui/input"
import { MediaPicker } from "@/shared/components/ui/media-picker"
import { type RadioCardOption, RadioCards } from "@/shared/components/ui/radio"
import { type IdentitySettingsInput, type IdentitySettingsOutput, IdentitySettingsSchema } from "@/shared/lib/schema"
import { useSettings } from "@/shared/lib/settings"

const IDENTITY_OPTIONS: RadioCardOption[] = [
	{ value: "person", label: "Person", desc: "A personal brand, blogger, freelancer, or individual creator.", icon: UserIcon },
	{ value: "organization", label: "Organization", desc: "A company, nonprofit, agency, or any structured entity.", icon: BuildingsIcon },
]

export function IdentitySettingsPage() {
	const { settings, update, isLoading } = useSettings()

	const form = useForm<IdentitySettingsInput, unknown, IdentitySettingsOutput>({
		defaultValues: {
			type: settings?.identity.type ?? "organization",
			person: {
				name: settings?.identity.person?.name ?? "",
				image: settings?.identity.person?.image?.id ?? null,
				social_profiles: [...(settings?.identity.person?.social_profiles ?? [])],
			},
			organization: {
				name: settings?.identity.organization?.name ?? "",
				alternate_name: settings?.identity.organization?.alternate_name ?? "",
				description: settings?.identity.organization?.description ?? "",
				email: settings?.identity.organization?.email ?? "",
				employees: settings?.identity.organization?.employees ?? 0,
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
		<SettingsForm isLoading={isLoading} isDirty={form.formState.isDirty} onSubmit={form.handleSubmit(onSubmit)}>
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
					<TextInputField
						control={form.control}
						name="person.name"
						label="Full Name"
						placeholder="Jane Smith"
						description="The person's full name as it should appear in search results and author bios."
					/>

					<Controller
						name="person.image"
						control={form.control}
						render={({ field }) => (
							<MediaPicker
								type="image"
								width={400}
								height={400}
								label="Profile Photo"
								desc={
									<>
										Used in Schema.org Person markup and as the author avatar. Recommended: square image, at least{" "}
										<strong>400 × 400 px</strong>.
									</>
								}
								url={settings?.identity.person?.image?.url}
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

						<TextInputField
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
									width={600}
									height={200}
									label="Logo"
									desc={
										<>
											Recommended: transparent PNG or SVG, <strong>600 × 200 px</strong> minimum. Google requires logos to be between 160px
											and 1920px wide.
										</>
									}
									url={settings?.identity.organization?.logo?.url}
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

						<NumberInputField
							name="organization.employees"
							control={form.control}
							label="Number of Employees"
							description="Approximate number of employees. Maps to Schema.org numberOfEmployees."
						/>
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
								<div>
									<div className="flex items-center gap-2">
										<TextInput
											name={`${field.name}.platform`}
											placeholder="Platform"
											value={value?.platform ?? ""}
											onChange={(platform) => field.onChange({ ...value, platform })}
											className="w-40"
										/>
										<TextInput
											name={`${field.name}.url`}
											placeholder="https://..."
											value={value?.url ?? ""}
											onChange={(url) => field.onChange({ ...value, url })}
											className="flex-1"
										/>
										<Button type="button" variant="ghost" onClick={() => remove(index)} aria-label="Remove profile">
											<TrashIcon />
										</Button>
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

import { zodResolver } from "@hookform/resolvers/zod"
import {
	AtSignIcon,
	BuildingIcon,
	CalendarIcon,
	FileTextIcon,
	PhoneIcon,
	PlusIcon,
	TagIcon,
	Trash2Icon,
	TypeIcon,
	UserIcon,
} from "lucide-react"
import { type Control, Controller, type FieldPath, useFieldArray, useForm } from "react-hook-form"
import { NumberInputField, TextInputField } from "@/modules/settings/shared/fields"
import { MediaPicker } from "@/modules/settings/shared/media-picker"
import { SettingsGroup, SettingsSet } from "@/modules/settings/shared/settings"
import { type IdentitySettingsInput, type IdentitySettingsOutput, IdentitySettingsSchema } from "@/shared/lib/schema"
import { useSettings } from "@/shared/lib/settings"
import { Button } from "@/shared/ui/button"
import { Card, CardContent } from "@/shared/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSeparator, FieldSet } from "@/shared/ui/field"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/shared/ui/input-group"
import { RadioGroup } from "@/shared/ui/radio-group"

export const DEFAULT_SOCIAL_PROFILES = [
	{ platform: "Facebook", url: "" },
	{ platform: "X (Twitter)", url: "" },
	{ platform: "LinkedIn", url: "" },
	{ platform: "Instagram", url: "" },
	{ platform: "YouTube", url: "" },
]

interface IdentityTypeOption {
	value: string
	label: string
	description: string
	icon: React.ReactNode
}

const IDENTITY_OPTIONS: IdentityTypeOption[] = [
	{
		value: "person",
		label: "Person",
		description: "A personal brand, blogger, freelancer, or individual creator.",
		icon: <UserIcon />,
	},
	{
		value: "organization",
		label: "Organization",
		description: "A company, nonprofit, agency, or any structured entity.",
		icon: <BuildingIcon />,
	},
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
	}

	return (
		<form onSubmit={form.handleSubmit(onSubmit)} className="relative">
			<SettingsSet isLoading={isLoading}>
				{/* ── Identity Type ── */}
				<SettingsGroup
					heading={<>Identity</>}
					description={
						<>
							Select whether this site represents a person or an organization. This determines which structured data (Schema.org) Kizlo
							outputs and which fields are shown below.
						</>
					}
				>
					<Controller
						name="type"
						control={form.control}
						render={({ field, fieldState }) => (
							<Field data-invalid={fieldState.invalid}>
								<RadioGroup value={field.value} onValueChange={field.onChange} className="grid grid-cols-2 gap-3">
									{IDENTITY_OPTIONS.map((option) => {
										const isSelected = option.value === field.value

										return (
											<FieldLabel key={option.value} htmlFor={`identity-type-${option.value}`} className="cursor-pointer">
												<Card data-selected={isSelected} className="h-40 shadow-none transition-all data-[selected=true]:border-primary">
													<CardContent className="flex flex-col gap-2">
														<div className="mb-1 flex items-center justify-between">
															<span className="text-muted-foreground [data-selected=true]:text-primary">{option.icon}</span>
														</div>

														<div>
															<p className="mb-1 font-medium text-sm">{option.label}</p>
															<p className="text-muted-foreground text-xs">{option.description}</p>
														</div>

														<input
															type="radio"
															id={`identity-type-${option.value}`}
															value={option.value}
															checked={isSelected}
															onChange={() => field.onChange(option.value)}
															className="sr-only"
														/>
													</CardContent>
												</Card>
											</FieldLabel>
										)
									})}
								</RadioGroup>
								{fieldState.invalid && <FieldError errors={[fieldState.error]} />}
							</Field>
						)}
					/>
				</SettingsGroup>

				<FieldSeparator />

				{/* PERSON BRANCH */}
				{identityType === "person" && (
					<>
						{/* Person — Basic Info */}
						<SettingsGroup
							heading={<>Person</>}
							description={
								<>
									Details about the individual behind this site. Used in Schema.org <code>Person</code> structured data and author metadata
									across your posts.
								</>
							}
						>
							<Card>
								<CardContent>
									<FieldGroup>
										<TextInputField
											control={form.control}
											name="person.name"
											label="Full Name"
											placeholder="Jane Smith"
											icon={<UserIcon />}
											description="The person's full name as it should appear in search results and author bios."
										/>

										{/* Person image via MediaPicker */}
										<Controller
											name="person.image"
											control={form.control}
											render={({ field, fieldState }) => (
												<Field data-invalid={fieldState.invalid}>
													<FieldLabel htmlFor="person.image">Profile Photo</FieldLabel>
													<MediaPicker
														type="image"
														width={400}
														height={400}
														url={settings?.identity.person?.image?.url}
														onValueChange={(item) => field.onChange(item?.id ?? null)}
													/>
													<FieldDescription>
														Used in Schema.org <code>Person</code> markup and as the author avatar. Recommended: square image, at least{" "}
														<strong>400 × 400 px</strong>.
													</FieldDescription>
													{fieldState.invalid && <FieldError errors={[fieldState.error]} />}
												</Field>
											)}
										/>
									</FieldGroup>
								</CardContent>
							</Card>

							<Card>
								<CardContent>
									<SocialProfilesField
										control={form.control}
										name="person.social_profiles"
										legend="Social Profiles"
										description="Links to the person's social media profiles. Added to Schema.org structured data to help Google associate this site with social accounts."
									/>
								</CardContent>
							</Card>
						</SettingsGroup>
					</>
				)}

				{/* ORGANIZATION BRANCH */}
				{identityType === "organization" && (
					<>
						<SettingsGroup
							heading={<>Organization</>}
							description={
								<>
									Core details about your organization. Used in Schema.org <code>Organization</code> structured data across your site.
								</>
							}
						>
							<Card>
								<CardContent>
									<FieldGroup>
										<TextInputField
											control={form.control}
											name="organization.name"
											label="Organization Name"
											placeholder="Acme Inc."
											icon={<BuildingIcon />}
											description="The official public-facing name of your organization."
										/>

										<TextInputField
											control={form.control}
											name="organization.alternate_name"
											label="Alternate Name"
											placeholder="Acme"
											icon={<TypeIcon />}
											description={
												<>
													A shorter or alternate name (e.g. acronym or brand nickname). Added to the <code>alternateName</code> field in
													structured data.
												</>
											}
										/>

										<TextInputField
											control={form.control}
											name="organization.slogan"
											label="Slogan"
											placeholder="Building tools people love"
											icon={<TagIcon />}
											description="Your organization's tagline or motto. Maps to the Schema.org sameAs slogan field."
										/>

										<TextInputField
											control={form.control}
											name="organization.description"
											label="Description"
											placeholder="We build fast, reliable WordPress plugins..."
											icon={<FileTextIcon />}
											description="A short description of what your organization does. Used in structured data and as a meta description fallback."
										/>
									</FieldGroup>
								</CardContent>
							</Card>

							<Card>
								<CardContent>
									<SocialProfilesField
										control={form.control}
										name="organization.social_profiles"
										legend="Organization Social Profiles"
										description="Official social media profiles for your organization. Added to Schema.org structured data to help Google associate your brand across platforms."
									/>
								</CardContent>
							</Card>

							<Card>
								<CardContent>
									<FieldGroup>
										<Controller
											name="organization.logo"
											control={form.control}
											render={({ field, fieldState }) => (
												<Field data-invalid={fieldState.invalid}>
													<FieldLabel htmlFor="organization.logo">Logo</FieldLabel>
													<MediaPicker
														type="image"
														width={600}
														height={200}
														url={settings?.identity.organization?.logo?.url}
														onValueChange={(item) => field.onChange(item?.id ?? null)}
													/>
													<FieldDescription>
														Recommended: transparent PNG or SVG, <strong>600 × 200 px</strong> minimum. Google requires logos to be between
														160px and 1920px wide.
													</FieldDescription>
													{fieldState.invalid && <FieldError errors={[fieldState.error]} />}
												</Field>
											)}
										/>
									</FieldGroup>
								</CardContent>
							</Card>
						</SettingsGroup>

						<FieldSeparator />

						<SettingsGroup
							heading={<>Contact & Legal</>}
							description={
								<>Contact details and legal information. These help search engines and knowledge panels display accurate business info.</>
							}
						>
							<Card>
								<CardContent>
									<FieldGroup>
										<TextInputField
											control={form.control}
											name="organization.email"
											label="Email"
											placeholder="hello@acme.com"
											icon={<AtSignIcon />}
											description="A public contact email address for your organization."
										/>

										<TextInputField
											control={form.control}
											name="organization.phone"
											label="Phone"
											placeholder="+1 (555) 000-0000"
											icon={<PhoneIcon />}
											description="A public phone number in international format (e.g. +1 555 000 0000)."
										/>

										<TextInputField
											control={form.control}
											name="organization.legal_name"
											label="Legal Name"
											placeholder="Acme Incorporated"
											icon={<FileTextIcon />}
											description={
												<>
													The registered legal name of your organization if different from the display name. Maps to Schema.org{" "}
													<code>legalName</code>.
												</>
											}
										/>

										<TextInputField
											control={form.control}
											name="organization.founding_date"
											label="Founding Date"
											placeholder="2018-04-01"
											icon={<CalendarIcon />}
											description={
												<>
													The date your organization was founded in <code>YYYY-MM-DD</code> format. Maps to Schema.org{" "}
													<code>foundingDate</code>.
												</>
											}
										/>

										<NumberInputField
											name="organization.employees"
											control={form.control}
											label="Number of Employees"
											description={
												<>
													Approximate number of employees. Maps to Schema.org <code>numberOfEmployees</code>.
												</>
											}
										/>

										{/* <Controller
											render={({ field, fieldState }) => (
												<Field data-invalid={fieldState.invalid}>
													<FieldLabel htmlFor="organization.employees"></FieldLabel>
													<input
														id="organization.employees"
														type="number"
														min={0}
														value={field.value ?? ""}
														onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
														aria-invalid={fieldState.invalid}
														placeholder="42"
														className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
													/>
													<FieldDescription></FieldDescription>
													{fieldState.invalid && <FieldError errors={[fieldState.error]} />}
												</Field>
											)}
										/> */}
									</FieldGroup>
								</CardContent>
							</Card>
						</SettingsGroup>

						<FieldSeparator />

						<SettingsGroup
							heading={<>Founder</>}
							description={
								<>
									Optionally attribute the organization to a founder. Maps to Schema.org <code>founder</code> and helps Google associate the
									brand with an individual.
								</>
							}
						>
							<Card>
								<CardContent>
									<FieldGroup>
										<TextInputField
											control={form.control}
											name="organization.founder.name"
											label="Founder Name"
											placeholder="Jane Smith"
											icon={<UserIcon />}
											description="Full name of the organization's founder."
										/>

										<SocialProfilesField
											control={form.control}
											name="organization.founder.social_profiles"
											legend="Founder Social Profiles"
											description="Social profiles for the founder. Helps search engines link the founder's online presence to your organization."
										/>
									</FieldGroup>
								</CardContent>
							</Card>
						</SettingsGroup>
					</>
				)}
			</SettingsSet>
		</form>
	)
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface SocialProfilesFieldProps<TFieldValues extends IdentitySettingsInput, TTransformedValues extends IdentitySettingsOutput> {
	control: Control<TFieldValues, unknown, TTransformedValues>
	name: FieldPath<TFieldValues>
	legend?: string
	description?: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SocialProfilesField<TFieldValues extends IdentitySettingsInput, TTransformedValues extends IdentitySettingsOutput>({
	control,
	name,
	legend = "Social Profiles",
	description = "Add links to social media profiles. These are included in your site's structured data to help search engines associate your brand across platforms.",
}: SocialProfilesFieldProps<TFieldValues, TTransformedValues>) {
	const { fields, append, remove } = useFieldArray({ control, name: name as never })

	return (
		<FieldSet>
			<FieldLegend variant="label">{legend}</FieldLegend>
			<FieldDescription>{description}</FieldDescription>

			<FieldGroup>
				{fields.map((item, index) => (
					<Controller
						key={item.id}
						name={`${name}.${index}` as never}
						control={control}
						render={({ field, fieldState }: { field: any; fieldState: any }) => {
							return (
								<Field data-invalid={fieldState.invalid}>
									<InputGroup>
										{/* Platform name */}
										<InputGroupAddon align="inline-start" className="">
											<InputGroupInput
												placeholder="Platform"
												value={field.value?.platform}
												aria-invalid={fieldState.invalid}
												aria-label={`Platform name ${index + 1}`}
												onChange={(e) => field.onChange({ ...field.value, platform: e.target.value })}
												className="max-w-24 border-r pl-0"
											/>
										</InputGroupAddon>

										{/* URL */}
										<InputGroupInput
											placeholder="https://..."
											value={field.value?.url}
											aria-invalid={fieldState.invalid}
											aria-label={`Profile URL ${index + 1}`}
											onChange={(e) => field.onChange({ ...field.value, url: e.target.value })}
										/>

										{/* Remove button */}
										<InputGroupAddon align="inline-end">
											<InputGroupButton
												type="button"
												variant="ghost"
												size="icon-xs"
												onClick={() => remove(index)}
												aria-label={`Remove ${field.value?.platform || "profile"}`}
											>
												<Trash2Icon />
											</InputGroupButton>
										</InputGroupAddon>
									</InputGroup>

									{fieldState.invalid && <FieldError errors={[fieldState.error]} />}
								</Field>
							)
						}}
					/>
				))}

				{/* Add custom platform */}
				<Button type="button" variant="outline" size="sm" onClick={() => append({ platform: "", url: "" } as never)}>
					<PlusIcon />
					Add Platform
				</Button>
			</FieldGroup>
		</FieldSet>
	)
}

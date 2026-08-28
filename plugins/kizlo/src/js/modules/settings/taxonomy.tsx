import { zodResolver } from "@hookform/resolvers/zod"
import { type ReactNode, useMemo } from "react"
import { type Control, type UseFormReturn, useForm } from "react-hook-form"
import { useLocation, useNavigate, useParams } from "react-router-dom"
import { CustomFieldsBuilder } from "@/modules/settings/custom-fields/builder"
import { DeleteRegistration } from "@/modules/settings/registration/delete-dialog"
import { taxonomyRegistrationValues } from "@/modules/settings/registration/lib"
import {
	TaxonomyActiveField,
	TaxonomyApiFields,
	TaxonomyContentFields,
	TaxonomyDefaultTermFields,
	TaxonomyHierarchicalField,
	TaxonomyIdentityFields,
	TaxonomyLabelFields,
	TaxonomyLabelSync,
	TaxonomyMetaBoxField,
	TaxonomyPublicField,
	TaxonomyShowAdminColumnField,
	TaxonomyShowInMenuField,
	TaxonomyShowInNavMenusField,
	TaxonomyShowInQuickEditField,
	TaxonomyShowTagcloudField,
	TaxonomyShowUiField,
	TaxonomySortField,
} from "@/modules/settings/registration/taxonomy-cards"
import { getContent } from "@/modules/settings/shared/content"
import { NotFound } from "@/modules/settings/shared/not-found"
import { BreadcrumbsField } from "@/shared/components/breadcrumbs-field"
import { SwitchField } from "@/shared/components/fields"
import { SectionDesc } from "@/shared/components/section-desc"
import { SettingsCard, SettingsCollapsibleCard, SettingsForm, SettingsGroup } from "@/shared/components/settings"
import { VariableField } from "@/shared/components/variable-field"
import { useNavPage } from "@/shared/lib/nav"
import {
	createTaxonomyUnifiedSchema,
	type TaxonomyRegistrationInput,
	type TaxonomyRegistrationOutput,
	type TaxonomyUnifiedInput,
	type TaxonomyUnifiedOutput,
} from "@/shared/lib/schema"
import { useSettings, useSettingsForm } from "@/shared/lib/settings"

export function TaxonomySettingsPage() {
	const params = useParams<{ slug: string }>()
	const navigate = useNavigate()
	const { pathname } = useLocation()
	const { settings } = useSettings()
	const taxonomy = settings?.taxonomies.find((a) => a.slug === params.slug)
	const navPage = useNavPage(pathname)
	const postTypeOptions = useMemo(() => (settings?.post_types ?? []).map((t) => ({ value: t.slug, label: t.name })), [settings])

	const schema = useMemo(() => createTaxonomyUnifiedSchema(), [])

	const values = useMemo<TaxonomyUnifiedInput>(() => {
		const settingsValues = {
			pathname_structure: taxonomy?.pathname_structure ?? "",
			title_structure: taxonomy?.title_structure ?? "",
			description_structure: taxonomy?.description_structure ?? "",
			search_engine_visibility: taxonomy?.search_engine_visibility ?? false,
			rest_api_enabled: taxonomy?.rest_api_enabled ?? false,
			seo_enabled: taxonomy?.seo_enabled ?? false,
			breadcrumbs: (taxonomy?.breadcrumbs ?? []).map(String),
			custom_fields: taxonomy?.custom_fields ?? [],
		}

		return taxonomy?.kizlo_owned && taxonomy.registration
			? { ...settingsValues, ...taxonomyRegistrationValues(taxonomy.registration) }
			: settingsValues
	}, [taxonomy])

	const form = useForm<TaxonomyUnifiedInput, unknown, TaxonomyUnifiedOutput>({ resolver: zodResolver(schema), values })
	const formProps = useSettingsForm("taxonomies", taxonomy?.slug ?? "", form)

	if (!taxonomy) return <NotFound />

	const isKizlo = Boolean(taxonomy.kizlo_owned && taxonomy.registration)
	const isSeoSupported = form.watch("seo_enabled")
	const content = getContent({ name: taxonomy.name })
	const sections = navPage?.sections ?? []

	const regControl = form.control as unknown as Control<TaxonomyRegistrationInput, unknown, TaxonomyRegistrationOutput>
	const regForm = form as unknown as UseFormReturn<TaxonomyRegistrationInput, unknown, TaxonomyRegistrationOutput>

	// Section bodies keyed by the served section id (see PHP SettingsNav). The
	// served nav supplies each section's heading/description and decides which
	// appear and in what order; a section gated out for this type is never listed.
	const bodies: Partial<Record<string, ReactNode>> = {
		fields: (
			<SettingsCard>
				<CustomFieldsBuilder control={form.control} name="custom_fields" />
			</SettingsCard>
		),
		seo: (
			<>
				<SettingsCard>
					<SwitchField
						control={form.control}
						name="seo_enabled"
						label={content.seo.enabled.label}
						description={content.seo.enabled.description}
					/>
				</SettingsCard>

				{isSeoSupported ? (
					<>
						<SettingsCard>
							<SwitchField
								name="search_engine_visibility"
								control={form.control}
								label={content.seo.visibility.label}
								description={content.seo.visibility.description}
							/>
						</SettingsCard>

						<SettingsCard>
							<VariableField
								control={form.control}
								name="title_structure"
								label={content.meta.title.label}
								placeholder={settings?.constants.taxonomy.default_title_format}
								description={content.meta.title.description}
								variables={settings?.constants.taxonomy.content_variables ?? []}
								variant="text"
							/>

							<VariableField
								variant="textarea"
								control={form.control}
								name="description_structure"
								label={content.meta.description_.label}
								placeholder={settings?.constants.taxonomy.default_desc_format}
								description={content.meta.description_.description}
								variables={settings?.constants.taxonomy.content_variables ?? []}
							/>
						</SettingsCard>

						<SettingsCard>
							<BreadcrumbsField
								control={form.control}
								name="breadcrumbs"
								label="Breadcrumb trail"
								description={
									<>
										The crumbs between <strong>Home</strong> and the current term. Add pages, or the dynamic <strong>Parent</strong> slot
										(expands to parent terms). Order matters — reorder with the arrows. Leave empty for <strong>Home → current</strong>.
									</>
								}
							/>
						</SettingsCard>
					</>
				) : null}
			</>
		),
		api: (
			<SettingsCard>
				<SwitchField
					control={form.control}
					name="rest_api_enabled"
					label={content.access.enabled.label}
					description={content.access.enabled.description}
				/>
			</SettingsCard>
		),
		general: (
			<>
				<SettingsCard>
					{isKizlo ? <TaxonomyIdentityFields control={regControl} /> : null}
					<VariableField
						name="pathname_structure"
						label={content.url.pathname.label}
						control={form.control}
						variables={settings?.constants.taxonomy.path_variables ?? []}
						description={content.url.pathname.description}
					/>
					{isKizlo ? <TaxonomyContentFields control={regControl} postTypeOptions={postTypeOptions} /> : null}
				</SettingsCard>

				{isKizlo ? (
					<>
						<SettingsCollapsibleCard
							title="Admin labels"
							description="Override the wording WordPress shows for this taxonomy, like the menu name and the “Add new item” button."
						>
							<TaxonomyLabelFields control={regControl} />
						</SettingsCollapsibleCard>

						<SettingsCard>
							<TaxonomyActiveField control={regControl} />
						</SettingsCard>
					</>
				) : null}
			</>
		),
		advanced: (
			<>
				<SettingsCard>
					<TaxonomyPublicField control={regControl} />
				</SettingsCard>
				<SettingsCard>
					<TaxonomyHierarchicalField control={regControl} />
				</SettingsCard>
				<SettingsCard>
					<TaxonomyShowUiField control={regControl} />
				</SettingsCard>
				<SettingsCard>
					<TaxonomyShowInMenuField control={regControl} />
				</SettingsCard>
				<SettingsCard>
					<TaxonomyMetaBoxField control={regControl} />
				</SettingsCard>
				<SettingsCard>
					<TaxonomyShowInNavMenusField control={regControl} />
				</SettingsCard>
				<SettingsCard>
					<TaxonomyShowTagcloudField control={regControl} />
				</SettingsCard>
				<SettingsCard>
					<TaxonomyShowInQuickEditField control={regControl} />
				</SettingsCard>
				<SettingsCard>
					<TaxonomyShowAdminColumnField control={regControl} />
				</SettingsCard>
				<SettingsCard>
					<TaxonomySortField control={regControl} />
				</SettingsCard>
				<SettingsCollapsibleCard
					title="Default term"
					description="A term created with the taxonomy and applied to entries when none is selected."
				>
					<TaxonomyDefaultTermFields control={regControl} />
				</SettingsCollapsibleCard>
				<SettingsCard>
					<SwitchField
						control={form.control}
						name="rest_api_enabled"
						label={content.access.enabled.label}
						description={content.access.enabled.description}
					/>
				</SettingsCard>
				<SettingsCard>
					<TaxonomyApiFields control={regControl} />
				</SettingsCard>
				{navPage?.delete ? (
					<SettingsCard>
						<DeleteRegistration
							kind="taxonomies"
							slug={taxonomy.slug}
							name={taxonomy.registration?.plural_label || taxonomy.slug}
							label={navPage.delete.label}
							desc={navPage.delete.desc}
							onDeleted={() => navigate("/general/site")}
						/>
					</SettingsCard>
				) : null}
			</>
		),
	}

	return (
		<SettingsForm key={params.slug} {...formProps}>
			{sections.map((section) => (
				<SettingsGroup key={section.id} id={section.id} title={section.title} desc={<SectionDesc html={section.desc} />}>
					{bodies[section.id]}
				</SettingsGroup>
			))}

			{isKizlo ? <TaxonomyLabelSync form={regForm} /> : null}
		</SettingsForm>
	)
}

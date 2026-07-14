import { zodResolver } from "@hookform/resolvers/zod"
import { type Control, Controller, type FieldPath, useForm } from "react-hook-form"
import { FieldError } from "@/shared/components/fields"
import { SettingsForm, SettingsSection } from "@/shared/components/settings"
import { MediaPicker } from "@/shared/components/ui/media-picker"
import { BrandSettingsSchema, type BrandSettingsSchemaInput, type BrandSettingsSchemaOutput } from "@/shared/lib/schema"
import { useSettings } from "@/shared/lib/settings"

type BrandControl = Control<BrandSettingsSchemaInput, unknown, BrandSettingsSchemaOutput>
type BrandFieldName = FieldPath<BrandSettingsSchemaInput>

interface MediaFieldProps {
	label: string
	control: BrandControl
	name: BrandFieldName
	url?: string
	width: number
	height: number
	desc: React.ReactNode
}

function MediaField({ control, label, name, url, width, height, desc }: MediaFieldProps) {
	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<div>
					<MediaPicker label={label} type="image" desc={desc} url={url} onValueChange={(item) => field.onChange(item?.id ?? null)} />
					<FieldError message={fieldState.error?.message} />
				</div>
			)}
		/>
	)
}

export function BrandSettingsPage() {
	const { settings, update, isLoading } = useSettings()
	const brand = settings?.brand

	const form = useForm<BrandSettingsSchemaInput, unknown, BrandSettingsSchemaOutput>({
		resolver: zodResolver(BrandSettingsSchema),
		defaultValues: {
			logo: brand?.logo?.id ?? null,
			logo_dark: brand?.logo_dark?.id ?? null,
			logo_icon: brand?.logo_icon?.id ?? null,
			logo_icon_dark: brand?.logo_icon_dark?.id ?? null,
			logo_wordmark: brand?.logo_wordmark?.id ?? null,
			logo_wordmark_dark: brand?.logo_wordmark_dark?.id ?? null,
			favicon: brand?.favicon?.id ?? null,
			favicon_dark: brand?.favicon_dark?.id ?? null,
			apple_touch_icon: brand?.apple_touch_icon?.id ?? null,
		},
	})

	async function onSubmit(data: BrandSettingsSchemaOutput) {
		await update("brand", data)
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
				title="Primary logo"
				desc="The full lockup, typically the icon plus the word mark. The dark variant is shown when the visitor prefers a dark color scheme; the light version is used when it's empty."
			>
				<MediaField
					control={form.control}
					{...{
						label: "Logo",
						name: "logo",
						url: brand?.logo?.url,
						width: 320,
						height: 80,
						desc: (
							<>
								Shown on light backgrounds. Transparent SVG or PNG, around <strong>320 × 80 px</strong>.
							</>
						),
					}}
				/>

				<MediaField
					control={form.control}
					{...{
						label: "Logo Dark",
						name: "logo_dark",
						url: brand?.logo_dark?.url,
						width: 320,
						height: 80,
						desc: "Shown on dark backgrounds. Optional; the light logo is used if empty.",
					}}
				/>
			</SettingsSection>

			<SettingsSection
				title="Icon"
				desc="The square mark on its own, without the wordmark. Used in tight spaces such as a collapsed header or an avatar."
			>
				<MediaField
					control={form.control}
					{...{
						label: "Logo Icon",
						name: "logo_icon",
						url: brand?.logo_icon?.url,
						width: 512,
						height: 512,
						desc: (
							<>
								Shown on light backgrounds. Square SVG or PNG, at least <strong>512 × 512 px</strong>.
							</>
						),
					}}
				/>

				<MediaField
					control={form.control}
					{...{
						label: "Logo Icon Dark",
						name: "logo_icon_dark",
						url: brand?.logo_icon_dark?.url,
						width: 512,
						height: 512,
						desc: "Shown on dark backgrounds. Optional; the light icon is used if empty.",
					}}
				/>
			</SettingsSection>

			<SettingsSection title="Wordmark" desc="The brand name set as a logotype, without the icon.">
				<MediaField
					control={form.control}
					{...{
						label: "Logo Word Mark",
						name: "logo_wordmark",
						url: brand?.logo_wordmark?.url,
						width: 320,
						height: 80,
						desc: (
							<>
								Shown on light backgrounds. Transparent SVG or PNG, around <strong>320 × 80 px</strong>.
							</>
						),
					}}
				/>

				<MediaField
					control={form.control}
					{...{
						label: "Logo Word Mark Dark",
						name: "logo_wordmark_dark",
						url: brand?.logo_wordmark_dark?.url,
						width: 320,
						height: 80,
						desc: "Shown on dark backgrounds. Optional; the light wordmark is used if empty.",
					}}
				/>
			</SettingsSection>

			<SettingsSection
				title="Favicon"
				desc="The icon browsers show in tabs and bookmarks. A transparent mark needs both a light and dark version so it stays visible in each browser theme."
			>
				<MediaField
					control={form.control}
					{...{
						label: "Favicon",
						name: "favicon",
						url: brand?.favicon?.url,
						width: 512,
						height: 512,
						desc: (
							<>
								The default favicon, used on light browser themes and as the fallback. Square SVG or PNG, at least{" "}
								<strong>512 × 512 px</strong>.
							</>
						),
					}}
				/>

				<MediaField
					control={form.control}
					{...{
						label: "Favicon Dark",
						name: "favicon_dark",
						url: brand?.favicon_dark?.url,
						width: 512,
						height: 512,
						desc: "Shown when the browser is in dark mode. Optional; the default favicon is used if empty.",
					}}
				/>
			</SettingsSection>

			<SettingsSection
				title="App icon"
				desc="The icon shown when your site is added to an iOS home screen. It sits on the user's wallpaper with no transparency, so use an opaque, padded design rather than the transparent favicon."
			>
				<MediaField
					control={form.control}
					label="Icon"
					name="apple_touch_icon"
					url={brand?.apple_touch_icon?.url}
					width={180}
					height={180}
					desc={
						<>
							Opaque, padded PNG, at least <strong>180 × 180 px</strong>.
						</>
					}
				/>
			</SettingsSection>
		</SettingsForm>
	)
}

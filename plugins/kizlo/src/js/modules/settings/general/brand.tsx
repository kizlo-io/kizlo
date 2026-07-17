import { zodResolver } from "@hookform/resolvers/zod"
import { type Control, Controller, type FieldPath, useForm } from "react-hook-form"
import { ColorField, FieldError } from "@/shared/components/fields"
import { SettingsForm, SettingsSection } from "@/shared/components/settings"
import { MediaPicker } from "@/shared/components/ui/media-picker"
import { BrandSettingsSchema, type BrandSettingsSchemaInput, type BrandSettingsSchemaOutput } from "@/shared/lib/schema"
import { useSettings, useSettingsForm } from "@/shared/lib/settings"

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
					<MediaPicker
						label={label}
						type="image"
						desc={desc}
						url={url}
						value={typeof field.value === "number" ? field.value : null}
						onValueChange={(item) => field.onChange(item?.id ?? null)}
					/>
					<FieldError message={fieldState.error?.message} />
				</div>
			)}
		/>
	)
}

export function BrandSettingsPage() {
	const { settings } = useSettings()
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
			app_icon: brand?.app_icon?.id ?? null,
			theme_color: brand?.theme_color ?? null,
			theme_color_dark: brand?.theme_color_dark ?? null,
			background_color: brand?.background_color ?? null,
		},
	})

	return (
		<SettingsForm {...useSettingsForm("brand", form)}>
			<SettingsSection
				title="Colors"
				desc="The theme color tints the mobile browser chrome and the installed app's window; its dark variant is used when the visitor prefers a dark color scheme. The background color fills the app launch screen while it loads."
			>
				<ColorField
					control={form.control}
					name="theme_color"
					label="Theme color"
					placeholder="#ffffff"
					description="Tints the browser address bar and the installed app's window chrome."
				/>
				<ColorField
					control={form.control}
					name="theme_color_dark"
					label="Theme color (dark)"
					placeholder="#000000"
					description="Used for the browser chrome when the visitor prefers a dark scheme. Optional; the light theme color is used if empty."
				/>
				<ColorField
					control={form.control}
					name="background_color"
					label="Background color"
					placeholder="#ffffff"
					description="Shown on the installed app's splash screen before it finishes loading."
				/>
			</SettingsSection>

			<SettingsSection
				title="Primary logo"
				desc="The full lockup, typically the icon plus the word mark. The dark variant is shown when the visitor prefers a dark color scheme; the light version is used when it's empty."
			>
				<MediaField
					control={form.control}
					{...{
						label: "Logo",
						name: "logo",
						url: brand?.logo?.src,
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
						url: brand?.logo_dark?.src,
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
						url: brand?.logo_icon?.src,
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
						url: brand?.logo_icon_dark?.src,
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
						url: brand?.logo_wordmark?.src,
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
						url: brand?.logo_wordmark_dark?.src,
						width: 320,
						height: 80,
						desc: "Shown on dark backgrounds. Optional; the light wordmark is used if empty.",
					}}
				/>
			</SettingsSection>

			<SettingsSection
				title="Favicon"
				desc="The icon browsers show in tabs and bookmarks. A single icon is used across light and dark browser themes, so choose one that stays legible on both."
			>
				<MediaField
					control={form.control}
					{...{
						label: "Favicon",
						name: "favicon",
						url: brand?.favicon?.src,
						width: 512,
						height: 512,
						desc: (
							<>
								Used in browser tabs and bookmarks. Keep it legible on both light and dark backgrounds. Square SVG or PNG, at least{" "}
								<strong>512 × 512 px</strong>.
							</>
						),
					}}
				/>
			</SettingsSection>

			<SettingsSection
				title="App icon"
				desc="Used when your site is added to a home screen or installed as an app on any platform. One icon serves them all."
			>
				<MediaField
					control={form.control}
					label="Icon"
					name="app_icon"
					url={brand?.app_icon?.src}
					width={512}
					height={512}
					desc={
						<>
							Square PNG, at least <strong>512 × 512 px</strong>.
						</>
					}
				/>
			</SettingsSection>
		</SettingsForm>
	)
}

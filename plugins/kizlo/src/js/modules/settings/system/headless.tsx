import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { SwitchField, TextInputField } from "@/shared/components/fields"
import { SettingsForm, SettingsSection } from "@/shared/components/settings"
import { type HeadlessSettingsInput, type HeadlessSettingsOutput, HeadlessSettingsSchema } from "@/shared/lib/schema"
import { useSettings, useSettingsForm } from "@/shared/lib/settings"
import { sectionsFor } from "../nav-model"

const S = sectionsFor("system/headless")

export function HeadlessSettingsPage() {
	const { settings } = useSettings()

	const form = useForm<HeadlessSettingsInput, unknown, HeadlessSettingsOutput>({
		resolver: zodResolver(HeadlessSettingsSchema),
		defaultValues: {
			enabled: settings?.headless.enabled ?? false,
			preview: settings?.headless.preview ?? true,
			view_links: settings?.headless.view_links ?? true,
			block_indexing: settings?.headless.block_indexing ?? true,
			frontend_lockout: settings?.headless.frontend_lockout ?? false,
			frontend_lockout_redirect: settings?.headless.frontend_lockout_redirect ?? false,
			disable_feeds: settings?.headless.disable_feeds ?? false,
			disable_embeds: settings?.headless.disable_embeds ?? false,
			disable_xmlrpc: settings?.headless.disable_xmlrpc ?? false,
			block_enumeration: settings?.headless.block_enumeration ?? false,
			clean_head: settings?.headless.clean_head ?? false,
			disable_file_editor: settings?.headless.disable_file_editor ?? false,
			disable_pingbacks: settings?.headless.disable_pingbacks ?? false,
			rename_login: settings?.headless.rename_login ?? false,
			login_slug: settings?.headless.login_slug ?? "",
		},
	})

	const enabled = form.watch("enabled")
	const renameLogin = form.watch("rename_login")
	const loginSlug = (form.watch("login_slug") ?? "").trim()
	const origin = typeof window !== "undefined" ? window.location.origin : ""

	return (
		<SettingsForm {...useSettingsForm("headless", form)}>
			<SettingsSection {...S("headless-mode")}>
				<SwitchField
					control={form.control}
					name="enabled"
					label="Enable Headless Mode"
					description="Turn on to activate the surfaces you choose below."
				/>
			</SettingsSection>

			<SettingsSection {...S("editor-experience")}>
				<SwitchField
					control={form.control}
					name="preview"
					disabled={!enabled}
					label="Headless preview"
					description="The editor Preview button opens the matching page on your headless frontend. Off restores the native WordPress preview."
				/>
				<SwitchField
					control={form.control}
					name="view_links"
					disabled={!enabled}
					label="View-post links"
					description="Editor and list-table &quot;View&quot; links point at your headless frontend instead of the WordPress origin."
				/>
			</SettingsSection>

			<SettingsSection {...S("display-routing")}>
				<SwitchField
					control={form.control}
					name="frontend_lockout"
					disabled={!enabled}
					label="Frontend lockout"
					description="Public theme requests are cut off with a bare 404 before the theme loads, since content is served from your headless frontend. Nothing renders, so a locked URL reveals nothing about the WordPress behind it. wp-admin, the REST API, login, and cron stay reachable."
				/>
				<SwitchField
					control={form.control}
					name="frontend_lockout_redirect"
					disabled={!enabled || !form.watch("frontend_lockout")}
					label="Redirect to frontend instead"
					description="Send visitors to the matching page on your headless frontend (a 301) rather than returning a hidden 404. More welcoming for stray visitors, but it reveals your frontend URL. Falls back to a 404 when no site URL is configured."
				/>
				<SwitchField
					control={form.control}
					name="disable_feeds"
					disabled={!enabled}
					label="Disable feeds"
					description="RSS, Atom, and comment feeds return 404. Nothing consumes them in a headless setup and they leak full content."
				/>
				<SwitchField
					control={form.control}
					name="disable_embeds"
					disabled={!enabled}
					label="Disable oEmbed & embeds"
					description="Remove the /embed frontend and oEmbed discovery links."
				/>
			</SettingsSection>

			<SettingsSection {...S("search-engine-control")}>
				<SwitchField
					control={form.control}
					name="block_indexing"
					disabled={!enabled}
					label="Block indexing of WordPress"
					description="Send X-Robots-Tag: noindex and disallow crawling on the WordPress origin. This enforces the core &quot;Discourage search engines&quot; option, which becomes read-only in Settings → Reading."
				/>
			</SettingsSection>

			<SettingsSection {...S("security-hardening")}>
				<SwitchField
					control={form.control}
					name="disable_xmlrpc"
					disabled={!enabled}
					label="Disable XML-RPC"
					description="Block xmlrpc.php."
				/>
				<SwitchField
					control={form.control}
					name="block_enumeration"
					disabled={!enabled}
					label="Block user/author enumeration"
					description="Stop ?author=N probes and public author archives from leaking usernames."
				/>
				<SwitchField
					control={form.control}
					name="clean_head"
					disabled={!enabled}
					label="Clean wp_head"
					description="Strip generator/version, RSD, WLW manifest, and shortlink tags."
				/>
				<SwitchField
					control={form.control}
					name="disable_file_editor"
					disabled={!enabled}
					label="Disable admin file editor"
					description="Force DISALLOW_FILE_EDIT so the theme and plugin code editors are unavailable."
				/>
				<SwitchField
					control={form.control}
					name="disable_pingbacks"
					disabled={!enabled}
					label="Disable pingbacks & trackbacks"
					description="Remove the X-Pingback header and the pingback XML-RPC methods."
				/>
				<SwitchField
					control={form.control}
					name="rename_login"
					disabled={!enabled}
					label="Rename login URL"
					description="Serve the login form only at a secret path so bots hammering wp-login.php get a 404. Login, logout, and password-reset links are rewritten to the new path, and logged-out wp-admin redirects there, so you are never locked out."
				/>
				<TextInputField
					control={form.control}
					name="login_slug"
					label="Login slug"
					placeholder="my-secret-login"
					description={
						renameLogin && loginSlug
							? `Login will live at ${origin}/${loginSlug} — write it down somewhere safe.`
							: "A hard-to-guess path (letters, numbers, and hyphens). Required to activate login renaming."
					}
				/>
			</SettingsSection>
		</SettingsForm>
	)
}

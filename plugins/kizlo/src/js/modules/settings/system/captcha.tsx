import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, useWatch } from "react-hook-form"
import z from "zod"
import { NumberInputField, SelectField, TextInputField } from "@/shared/components/fields"
import { SettingsForm, SettingsSection } from "@/shared/components/settings"
import { sectionsFor } from "@/shared/lib/nav"
import { useSettings, useSettingsForm } from "@/shared/lib/settings"

const S = sectionsFor("system/captcha")
const schema = z.object({
	provider: z.enum(["disabled", "recaptcha", "turnstile", "hcaptcha", "friendly", "arkose", "altcha"]),
	secret: z.string(),
	sitekey: z.string(),
	min_score: z.number().min(0).max(1),
})

export function CaptchaSettingsPage() {
	const { settings } = useSettings()
	const form = useForm<z.infer<typeof schema>>({
		resolver: zodResolver(schema),
		defaultValues: settings?.captcha ?? { provider: "disabled", secret: "", sitekey: "", min_score: 0.5 },
	})
	const provider = useWatch({ control: form.control, name: "provider" })
	return (
		<SettingsForm {...useSettingsForm("captcha", form)}>
			<SettingsSection {...S("verification")}>
				<SelectField
					control={form.control}
					name="provider"
					label="Provider"
					options={[
						{ value: "disabled", label: "Not configured" },
						{ value: "recaptcha", label: "reCAPTCHA" },
						{ value: "turnstile", label: "Cloudflare Turnstile" },
						{ value: "hcaptcha", label: "hCaptcha" },
						{ value: "friendly", label: "Friendly Captcha" },
						{ value: "arkose", label: "Arkose" },
						{ value: "altcha", label: "ALTCHA" },
					]}
				/>
				{provider !== "disabled" && (
					<>
						<TextInputField
							control={form.control}
							name="secret"
							label={provider === "altcha" ? "HMAC key" : "Secret key"}
							type="password"
						/>
						{["hcaptcha", "friendly"].includes(provider) && <TextInputField control={form.control} name="sitekey" label="Site key" />}
						{provider === "recaptcha" && <NumberInputField control={form.control} name="min_score" label="Minimum v3 score" />}
					</>
				)}
			</SettingsSection>
		</SettingsForm>
	)
}

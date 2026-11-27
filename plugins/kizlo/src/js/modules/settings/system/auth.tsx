import { zodResolver } from "@hookform/resolvers/zod"
import type { AuthSettings } from "@kizlo/shared"
import { useForm, useWatch } from "react-hook-form"
import z from "zod"
import { NumberInputField, SelectField, TextareaInputField, TextInputField } from "@/shared/components/fields"
import { SettingsForm, SettingsSection } from "@/shared/components/settings"
import { sectionsFor } from "@/shared/lib/nav"
import { useSettings, useSettingsForm } from "@/shared/lib/settings"

const S = sectionsFor("system/auth")
const lines = z.string().transform((value) =>
	value
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean),
)
const schema = z.object({
	provider: z.enum(["disabled", "clerk", "kinde", "custom"]),
	issuer: z.string().trim(),
	key_source: z.enum(["jwks", "public_key"]),
	jwks_url: z.string().trim(),
	public_key: z.string().trim(),
	algorithm: z.enum(["RS256", "ES256"]),
	audience: z.string().trim(),
	authorized_parties: lines,
	allowed_origins: lines,
	clock_tolerance: z.number().int().min(0).max(60),
	subject_claim: z.string(),
	email_claim: z.string(),
	email_verified_claim: z.string(),
	first_name_claim: z.string(),
	last_name_claim: z.string(),
	required_claims: z.string().transform((value, context): AuthSettings["required_claims"] => {
		try {
			const rules = JSON.parse(value)
			if (Array.isArray(rules)) return rules
		} catch {}
		context.addIssue({ code: "custom", message: "Enter a JSON array of claim requirements." })
		return z.NEVER
	}),
})

export function AuthSettingsPage() {
	const { settings } = useSettings()
	const saved = settings?.auth
	const form = useForm<z.input<typeof schema>, unknown, AuthSettings>({
		resolver: zodResolver(schema),
		defaultValues: {
			provider: saved?.provider ?? "disabled",
			issuer: saved?.issuer ?? "",
			key_source: saved?.key_source ?? "jwks",
			jwks_url: saved?.jwks_url ?? "",
			public_key: saved?.public_key ?? "",
			algorithm: saved?.algorithm ?? "RS256",
			audience: saved?.audience ?? "",
			authorized_parties: saved?.authorized_parties.join("\n") ?? "",
			allowed_origins: saved?.allowed_origins.join("\n") ?? "",
			clock_tolerance: saved?.clock_tolerance ?? 5,
			subject_claim: saved?.subject_claim ?? "sub",
			email_claim: saved?.email_claim ?? "email",
			email_verified_claim: saved?.email_verified_claim ?? "email_verified",
			first_name_claim: saved?.first_name_claim ?? "given_name",
			last_name_claim: saved?.last_name_claim ?? "family_name",
			required_claims: JSON.stringify(saved?.required_claims ?? [], null, 2),
		},
	})
	const provider = useWatch({ control: form.control, name: "provider" })
	const keySource = useWatch({ control: form.control, name: "key_source" })
	const custom = provider === "custom"

	return (
		<SettingsForm {...useSettingsForm("auth", form)}>
			<SettingsSection {...S("provider")}>
				<SelectField
					control={form.control}
					name="provider"
					label="Provider"
					options={[
						{ value: "disabled", label: "Disabled" },
						{ value: "clerk", label: "Clerk" },
						{ value: "kinde", label: "Kinde" },
						{ value: "custom", label: "Custom JWT" },
					]}
				/>
				{provider !== "disabled" && (
					<TextInputField control={form.control} name="issuer" label="Issuer URL" placeholder="https://auth.example.com" />
				)}
				{provider === "clerk" && (
					<p className="text-muted-foreground text-sm">
						In Clerk’s session token customization, add email and email_verified claims using the primary email and its verification status.
						WordPress retrieves signing keys from your Clerk instance.
					</p>
				)}
				{provider === "kinde" && (
					<p className="text-muted-foreground text-sm">
						Configure an API audience for WordPress and include email and email_verified claims in the user access token. WordPress
						retrieves signing keys from your Kinde domain.
					</p>
				)}
				<TextareaInputField
					control={form.control}
					name="allowed_origins"
					label="Frontend origins"
					description="Origins allowed to call the API from a browser, one per line. Use exact origins without a trailing slash."
				/>
			</SettingsSection>
			{provider !== "disabled" && (
				<>
					<SettingsSection {...S("verification")}>
						{custom && (
							<>
								<SelectField
									control={form.control}
									name="key_source"
									label="Signing keys"
									options={[
										{ value: "jwks", label: "JWKS URL" },
										{ value: "public_key", label: "PEM public key" },
									]}
								/>
								{keySource === "jwks" ? (
									<TextInputField control={form.control} name="jwks_url" label="JWKS URL" />
								) : (
									<TextareaInputField control={form.control} name="public_key" label="Public key" />
								)}
								<SelectField
									control={form.control}
									name="algorithm"
									label="Signing algorithm"
									options={[
										{ value: "RS256", label: "RS256" },
										{ value: "ES256", label: "ES256" },
									]}
								/>
							</>
						)}
						{(custom || provider === "kinde") && <TextInputField control={form.control} name="audience" label="API audience" />}
						{(custom || provider === "clerk") && (
							<TextareaInputField
								control={form.control}
								name="authorized_parties"
								label="Authorized parties"
								description="Origins permitted to obtain tokens, one per line. These are checked against the signed azp claim."
							/>
						)}

						{custom && <NumberInputField control={form.control} name="clock_tolerance" label="Clock tolerance (seconds)" />}
					</SettingsSection>
					<SettingsSection {...S("claims")}>
						{custom && <TextInputField control={form.control} name="subject_claim" label="User ID claim" />}
						<TextInputField control={form.control} name="email_claim" label="Email claim" />
						<TextInputField
							control={form.control}
							name="email_verified_claim"
							label="Email verification claim"
							description="Must contain the boolean true to link an existing customer by email. Unverified sessions may still use permitted guest flows."
						/>
						{custom && (
							<>
								<TextInputField control={form.control} name="first_name_claim" label="First name claim" />
								<TextInputField control={form.control} name="last_name_claim" label="Last name claim" />
								<TextareaInputField
									control={form.control}
									name="required_claims"
									label="Additional claim requirements"
									description={
										'JSON array. Example: [{"claim":"scope","operator":"contains","value":"storefront"}]. Supported operators: present, equals, one_of, contains.'
									}
								/>
							</>
						)}
					</SettingsSection>
				</>
			)}
		</SettingsForm>
	)
}

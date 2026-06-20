import { defineFixture, githubRelease, wpCli } from "kizlo/test"

const CF7_TITLE = "Test Form"

const CF7_FORM = `<label>Your name (required)
[text* your-name]</label>
<label>Your email (required)
[email* your-email]</label>
<label>Your message (required)
[textarea* your-message]</label>`

/**
 * Contact Form 7 test layer. CF7 has no REST create endpoint, so the form is
 * created via the `wpCli` escape hatch (`wp eval` over `WPCF7_ContactForm`).
 */
export function cf7() {
	return defineFixture({
		name: "cf7",
		plugins: [
			"contact-form-7",
			{
				name: "kizlo-cf7",
				source: githubRelease("kizlo-io/kizlo-wordpress", "kizlo-cf7-v1.0.0-beta.2"),
			},
		],
		async seed() {
			const existing = await wpCli([
				"post",
				"list",
				"--post_type=wpcf7_contact_form",
				`--title=${CF7_TITLE}`,
				"--field=ID",
				"--posts_per_page=1",
			])
			if (existing) return { cf7FormId: Number(existing) }

			const formB64 = Buffer.from(CF7_FORM).toString("base64")
			const php =
				`$form = WPCF7_ContactForm::get_template(['title' => '${CF7_TITLE}']); ` +
				`$form->set_properties(['form' => base64_decode('${formB64}')]); ` +
				`echo $form->save();`
			const id = await wpCli(["eval", php])
			return { cf7FormId: Number(id) }
		},
	})
}

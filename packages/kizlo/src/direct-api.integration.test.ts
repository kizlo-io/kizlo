import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto"
import { expect, test } from "vitest"
import { introspection } from "../../../introspection.browser"
import { createBrowserClient } from "./browser"
import { getTestCredentials } from "./cli/wp/utils"
import { deserializePage } from "./page/utils"
import { deserializePost } from "./post/utils"
import type { Settings } from "./settings/service.interface"
import { requireData } from "./wordpress/utils"

// Run through `kizlo test`: this suite needs the isolated, seeded fixture stack.
test("WordPress owns direct storefront identity, checkout, CAPTCHA and public content", async () => {
	const fixture = getTestCredentials()
	const base = new URL("/wp-json/", fixture.url)
	const authorization = `Basic ${btoa(`${fixture.users.admin.username}:${fixture.users.admin.applicationPassword}`)}`
	async function admin(path: string, body?: unknown) {
		const response = await fetch(new URL(`kizlo/v1/${path}`, base), {
			method: body ? "PUT" : "GET",
			headers: { Authorization: authorization, "Content-Type": "application/json" },
			body: body ? JSON.stringify(body) : undefined,
		})
		if (!response.ok) throw new Error(`Test settings request failed: ${response.status}`)
		return response.json()
	}
	const previous: Settings = await admin("settings")
	const keys = generateKeyPairSync("rsa", { modulusLength: 2048 })
	const issuer = "https://direct-test.example.com"
	const email = `direct-${randomUUID()}@example.test`
	const captchaSecret = randomUUID()
	let protectedPostId: number | undefined
	let token: string | null = null
	let cartToken: string | null = null
	const client = createBrowserClient({
		url: fixture.url,
		endpoints: introspection,
		getToken: () => token,
		cartSession: {
			get: () => cartToken,
			set: (value) => {
				cartToken = value
			},
		},
	})
	function session(verified: boolean) {
		const encode = (data: object) => Buffer.from(JSON.stringify(data)).toString("base64url")
		const message = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: issuer, sub: email, aud: "wordpress", exp: Math.floor(Date.now() / 1000) + 300, email, email_verified: verified })}`
		return `${message}.${sign("RSA-SHA256", Buffer.from(message), keys.privateKey).toString("base64url")}`
	}
	async function captcha() {
		const challenge = requireData(await client.kizlo.captcha.challenge.retrieve())
		let number = 0
		while (
			number <= challenge.maxnumber &&
			createHash("sha256")
				.update(challenge.salt + number)
				.digest("hex") !== challenge.challenge
		)
			number++
		expect(number).toBeLessThanOrEqual(challenge.maxnumber)
		return Buffer.from(JSON.stringify({ ...challenge, number })).toString("base64")
	}
	try {
		await admin("settings/auth", {
			provider: "custom",
			issuer,
			key_source: "public_key",
			public_key: keys.publicKey.export({ type: "spki", format: "pem" }),
			algorithm: "RS256",
			audience: "wordpress",
			authorized_parties: [],
			required_claims: [],
			allowed_origins: ["https://direct-store.example.com"],
		})
		await admin("settings/captcha", { provider: "altcha", secret: captchaSecret })
		const protectedResponse = await fetch(new URL("wp/v2/posts", base), {
			method: "POST",
			headers: { Authorization: authorization, "Content-Type": "application/json" },
			body: JSON.stringify({
				title: "Protected direct test",
				slug: `protected-${randomUUID()}`,
				content: "Private test content",
				status: "publish",
				password: randomUUID(),
			}),
		})
		if (!protectedResponse.ok) throw Error("Could not create protected test content")
		protectedPostId = (await protectedResponse.json()).id
		const posts = requireData(await client.kizlo.content.post.list({ query: { per_page: 100 } }))
		expect(posts.every((post) => post.status === "publish")).toBe(true)
		const locked = posts.find((post) => post.kizlo === null)
		expect(locked).toBeDefined()
		if (!locked) throw Error("Protected fixture missing")
		expect(deserializePost(locked)).toMatchObject({ protected: true, content: null, custom: null, seo: null })
		const pages = requireData(await client.kizlo.content.page.list({ query: { per_page: 100 } }))
		for (const page of pages) expect(deserializePage(page).protected).toBe(page.kizlo === null)

		const products = requireData(await client.woocommerce.store.products.list({ query: { slug: "test-product-1" } }))
		const product = products[0]
		if (!product) throw Error("Store product fixture missing")
		requireData(await client.woocommerce.store.cart.retrieve())
		expect(cartToken).toBeTruthy()
		const added = requireData(await client.woocommerce.store.cart.addItem.create({ body: { id: product.id, quantity: 1 } }))
		expect(added.items.some((item) => item.id === product.id)).toBe(true)
		const billing = {
			first_name: "Direct",
			last_name: "Test",
			email,
			address_1: "1 Test Street",
			address_2: "",
			city: "New York",
			state: "NY",
			postcode: "10001",
			country: "US",
			company: "",
			phone: "",
		}
		const conflict = await client.woocommerce.store.checkout.create({
			body: { billing_address: billing, shipping_address: billing, payment_method: "bacs", expected_total: "0" },
		})
		expect(conflict.status).toBe(409)
		expect(conflict.error?.code).toBe("woocommerce_rest_checkout_total_mismatch")
		const cart = requireData(await client.woocommerce.store.cart.retrieve())
		const order = requireData(
			await client.woocommerce.store.checkout.create({
				body: { billing_address: billing, shipping_address: billing, payment_method: "bacs", expected_total: cart.totals.total_price },
			}),
		)
		expect(order.order_id).toBeGreaterThan(0)
		expect(order.status).toBe("on-hold")
		requireData(await client.woocommerce.store.cart.addItem.create({ body: { id: product.id, quantity: 1 } }))
		token = session(false)
		expect((await client.woocommerce.kizlo.customers.retrieve()).status).toBe(401)
		expect((await client.woocommerce.store.cart.retrieve()).error).toBeNull()
		token = session(true)
		const customer = requireData(await client.woocommerce.kizlo.customers.retrieve())
		expect(customer.email).toBe(email)
		const merged = requireData(await client.woocommerce.store.cart.retrieve())
		expect(merged.items.some((item) => item.id === product.id)).toBe(true)
		token = null
		expect((await client.woocommerce.store.cart.retrieve()).status).toBe(401)
		cartToken = null

		const post = posts.find((post) => post.kizlo && post.comment_status === "open")
		if (!post) throw Error("Comment fixture missing")
		const proof = await captcha()
		const comment = requireData(
			await client.kizlo.comments.create({
				body: {
					post_id: post.id,
					content: `Direct comment ${randomUUID()}`,
					author_name: "Direct guest",
					author_email: email,
					captcha_token: proof,
				},
			}),
		)
		expect(comment.author).toBe(0)
		expect(comment.author_name).toBe("Direct guest")
		const replay = await client.kizlo.comments.create({ body: { post_id: post.id, content: "Replayed proof", captcha_token: proof } })
		expect(replay.error?.code).toBe("kizlo_captcha_invalid")
		const formId = Number(fixture.fixtures.cf7?.cf7FormId)
		expect(formId).toBeGreaterThan(0)
		const invalid = requireData(await client.cf7.forms.submit({ params: { form_id: formId }, body: { captcha_token: await captcha() } }))
		expect(invalid.status).toBe("validation_failed")
		expect(invalid.invalid_fields.length).toBeGreaterThan(0)
		const valid = requireData(
			await client.cf7.forms.submit({
				params: { form_id: formId },
				body: { captcha_token: await captcha(), "your-name": "Direct guest", "your-email": email, "your-message": "Local test submission" },
			}),
		)
		expect(valid.status).toBe("mail_sent")

		for (const [origin, allowed] of [
			["https://direct-store.example.com", true],
			["https://untrusted.example.com", false],
		] as const) {
			const preflight = await fetch(new URL("wc/store/v1/cart/add-item", base), {
				method: "OPTIONS",
				headers: {
					Origin: origin,
					"Access-Control-Request-Method": "POST",
					"Access-Control-Request-Headers": "authorization,cart-token,content-type",
				},
			})
			expect(preflight.status).toBe(200)
			expect(preflight.headers.get("Access-Control-Allow-Origin") === origin).toBe(allowed)
			expect(preflight.headers.get("Access-Control-Allow-Credentials")).toBeNull()
		}
	} finally {
		if (protectedPostId)
			await fetch(new URL(`wp/v2/posts/${protectedPostId}?force=true`, base), {
				method: "DELETE",
				headers: { Authorization: authorization },
			})
		await admin("settings/auth", previous.auth)
		await admin("settings/captcha", previous.captcha)
	}
}, 60_000)

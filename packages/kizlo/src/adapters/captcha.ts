export type CaptchaAdapter = (input: { token: string; ip: string }) => Promise<boolean>

/** Author a custom captcha adapter — types your verify function against the {@link CaptchaAdapter} contract. */
export function createCaptchaAdapter(adapter: CaptchaAdapter): CaptchaAdapter {
	return adapter
}

export function recaptcha(opts: { secret: string; minScore?: number }): CaptchaAdapter {
	return async ({ token, ip }) => {
		const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				secret: opts.secret,
				response: token,
				...(ip && { remoteip: ip }),
			}),
		})
		const data = await res.json()
		if (!data.success) return false
		if (opts.minScore !== undefined && data.score !== undefined) {
			return data.score >= opts.minScore
		}
		return true
	}
}

export function turnstile(opts: { secret: string }): CaptchaAdapter {
	return async ({ token, ip }) => {
		const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				secret: opts.secret,
				response: token,
				...(ip && { remoteip: ip }),
			}),
		})
		const data = await res.json()
		return data.success === true
	}
}

export function hcaptcha(opts: { secret: string; sitekey?: string }): CaptchaAdapter {
	return async ({ token, ip }) => {
		const res = await fetch("https://api.hcaptcha.com/siteverify", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				secret: opts.secret,
				response: token,
				...(ip && { remoteip: ip }),
				...(opts.sitekey && { sitekey: opts.sitekey }),
			}),
		})
		const data = await res.json()
		return data.success === true
	}
}

export function friendlyCaptcha(opts: { secret: string; sitekey?: string }): CaptchaAdapter {
	return async ({ token }) => {
		const res = await fetch("https://api.friendlycaptcha.com/api/v1/siteverify", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				solution: token,
				secret: opts.secret,
				...(opts.sitekey && { sitekey: opts.sitekey }),
			}),
		})
		const data = await res.json()
		return data.success === true
	}
}

export function arkose(opts: { privateKey: string }): CaptchaAdapter {
	return async ({ token, ip }) => {
		const res = await fetch("https://verify-api.arkoselabs.com/api/v4/verify/", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				private_key: opts.privateKey,
				session_token: token,
				...(ip && { log_data: ip }),
			}),
		})
		const data = await res.json()
		return data.session_details?.solved === true
	}
}

export function altcha(opts: { hmacKey: string }): CaptchaAdapter {
	return async ({ token }) => {
		try {
			const payload = JSON.parse(Buffer.from(token, "base64").toString("utf-8")) as {
				algorithm: string
				challenge: string
				number: number
				salt: string
				signature: string
			}
			const { createHmac, createHash } = await import("node:crypto")
			const algo = payload.algorithm.toLowerCase().replace("-", "")
			const check = createHash(algo).update(`${payload.salt}${payload.number}`).digest("hex")
			if (check !== payload.challenge) return false
			const sig = createHmac(algo, opts.hmacKey).update(payload.challenge).digest("hex")
			return sig === payload.signature
		} catch {
			return false
		}
	}
}

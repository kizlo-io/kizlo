import { type Duration, random, seconds, timestampSec, tryCatch } from "@kizlo/shared"
import { jwtVerify, SignJWT } from "jose"
import { type ConnInfo, createMiddleware, KizloError } from "kizlo"

interface TokenPayload {
	sub: string
	iat: number
	exp: number
}

const GUEST_COOKIE_OPTIONS = {
	httpOnly: true,
	path: "/",
	sameSite: "lax",
} as const

async function mintGuestToken(secret: string, ttlSeconds: number): Promise<{ jwt: string; sub: string }> {
	const sub = random({ length: 32, prefix: "t" })

	const jwt = await new SignJWT()
		.setProtectedHeader({ alg: "HS256", typ: "JWT" })
		.setSubject(sub)
		.setIssuedAt()
		.setExpirationTime(timestampSec() + ttlSeconds)
		.sign(encodeSecret(secret))

	return { jwt, sub }
}

async function verifyToken(token: string, secret: string): Promise<TokenPayload> {
	const { payload } = await jwtVerify<TokenPayload>(token, encodeSecret(secret))
	return payload
}

function encodeSecret(secret: string): Uint8Array {
	return new TextEncoder().encode(secret)
}

function getCartHeaders(options: { email?: string; token?: string; connInfo: ConnInfo | null }) {
	const { connInfo, email, token } = options

	const headers: Record<string, string> = {}

	if (token) headers["X-Kizlo-Guest-Token"] = token
	if (email) headers["X-Kizlo-User-Email"] = email
	if (connInfo?.city) headers["X-Kizlo-Geo-City"] = connInfo.city
	if (connInfo?.state) headers["X-Kizlo-Geo-State"] = connInfo.state
	if (connInfo?.country) headers["X-Kizlo-Geo-Country"] = connInfo.country
	if (connInfo?.postcode) headers["X-Kizlo-Geo-Postcode"] = connInfo.postcode

	return headers
}

export function sessionMiddleware(options?: { cookieName?: string; ttl?: Duration }) {
	const cookieName = options?.cookieName ?? "guest-session"
	const ttlSeconds = seconds(options?.ttl ?? "48 hours")

	return createMiddleware(async ({ context, next }) => {
		const connInfo = await context.getConnInfo()
		const session = await context.getSession()
		const foundToken = await context.cookies.get(cookieName)

		if (!session) {
			if (!foundToken) {
				const { jwt, sub } = await mintGuestToken(context.config.siteSecret, ttlSeconds)
				await context.cookies.set({ name: cookieName, value: jwt, options: GUEST_COOKIE_OPTIONS })
				return next({ context: { sessionHeaders: getCartHeaders({ token: sub, connInfo }) } })
			}

			const [err, data] = await tryCatch(verifyToken(foundToken, context.config.siteSecret))
			if (err) {
				const { jwt } = await mintGuestToken(context.config.siteSecret, ttlSeconds)
				await context.cookies.set({ name: cookieName, value: jwt, options: GUEST_COOKIE_OPTIONS })
				throw new KizloError("CART_SESSION_EXPIRED")
			}

			return next({ context: { sessionHeaders: getCartHeaders({ token: data.sub, connInfo }) } })
		}

		if (foundToken) {
			const [err, data] = await tryCatch(verifyToken(foundToken, context.config.siteSecret))

			if (!err) {
				const response = await context.wordpress.woocommerce.kizlo.cart.merge(
					{},
					{ headers: getCartHeaders({ email: session.email, token: data.sub, connInfo }) },
				)
				if (response.error) context.logger.error("CART_MERGE_FAILED", response.error)
			}

			await context.cookies.delete(cookieName, GUEST_COOKIE_OPTIONS)
		}

		return next({ context: { sessionHeaders: getCartHeaders({ email: session.email, connInfo }) } })
	})
}

import { type Duration, random, seconds, timestampSec, tryCatch } from "@kizlo/shared"
import { jwtVerify, SignJWT } from "jose"
import { type ConnInfo, createMiddleware, KizloError, WP_KIZLO_BASE } from "kizlo"

export interface TokenPayload {
	sub: string
	iat: number
	exp: number
}

export async function mintGuestToken(secret: string, ttlSeconds: number): Promise<{ jwt: string; sub: string }> {
	const sub = random({ length: 32, prefix: "t" })

	const jwt = await new SignJWT()
		.setProtectedHeader({ alg: "HS256", typ: "JWT" })
		.setSubject(sub)
		.setIssuedAt()
		.setExpirationTime(timestampSec() + ttlSeconds)
		.sign(encodeSecret(secret))

	return { jwt, sub }
}

export async function verifyToken(token: string, secret: string): Promise<TokenPayload> {
	const { payload } = await jwtVerify<TokenPayload>(token, encodeSecret(secret))
	return payload
}

export function encodeSecret(secret: string): Uint8Array {
	return new TextEncoder().encode(secret)
}

export function getCartHeaders(options: { userId?: number; token?: string; connInfo: ConnInfo | null }) {
	const { connInfo, userId, token } = options

	const headers: Record<string, string> = {}

	if (token) headers["X-Kizlo-Guest-Token"] = token
	if (userId) headers["X-Kizlo-User-Id"] = String(userId)
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
		const auth = await context.getAuthUser()
		const foundToken = await context.cookies.get(cookieName)

		if (!auth) {
			if (!foundToken) {
				const { jwt, sub } = await mintGuestToken(context.config.siteSecret, ttlSeconds)
				await context.cookies.set({ name: cookieName, value: jwt, options: { httpOnly: true, sameSite: "lax" } })
				return next({ context: { sessionHeaders: getCartHeaders({ token: sub, connInfo }) } })
			}

			const [err, data] = await tryCatch(verifyToken(foundToken, context.config.siteSecret))
			if (err) {
				const { jwt } = await mintGuestToken(context.config.siteSecret, ttlSeconds)
				await context.cookies.set({ name: cookieName, value: jwt, options: { httpOnly: true, sameSite: "lax" } })
				throw new KizloError("CART_SESSION_EXPIRED")
			}

			return next({ context: { sessionHeaders: getCartHeaders({ token: data.sub, connInfo }) } })
		}

		if (foundToken) {
			const [err, data] = await tryCatch(verifyToken(foundToken, context.config.siteSecret))

			if (!err) {
				const response = await context.service.wordpress.post("/cart/merge", {
					base: WP_KIZLO_BASE,
					headers: getCartHeaders({ userId: auth.id, token: data.sub, connInfo }),
				})
				if (response.error) context.logger.error("CART_MERGE_FAILED", response.error)
			}

			await context.cookies.delete(cookieName)
		}

		return next({ context: { sessionHeaders: getCartHeaders({ userId: auth.id, connInfo }) } })
	})
}

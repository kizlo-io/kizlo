/** The token method returned by Clerk's session/auth hooks. */
export interface ClerkTokenSource {
	getToken(): Promise<string | null>
}

/** Supply the current Clerk session token for each direct WordPress request. */
export function clerkToken(session: ClerkTokenSource): () => Promise<string | null> {
	return () => session.getToken()
}

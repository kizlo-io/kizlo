import { expect, test, vi } from "vitest"
import { clerkToken } from "."

test("reads refreshed and signed-out sessions for each request", async () => {
	const session = {
		getToken: vi.fn().mockResolvedValueOnce("first.jwt.token").mockResolvedValueOnce("second.jwt.token").mockResolvedValueOnce(null),
	}
	const getToken = clerkToken(session)
	expect(await getToken()).toBe("first.jwt.token")
	expect(await getToken()).toBe("second.jwt.token")
	expect(await getToken()).toBeNull()
	expect(session.getToken).toHaveBeenCalledTimes(3)
})

test("token resolution failures remain errors", async () => {
	const getToken = clerkToken({
		getToken: async () => {
			throw new Error("Session unavailable")
		},
	})
	await expect(getToken()).rejects.toThrow("Session unavailable")
})

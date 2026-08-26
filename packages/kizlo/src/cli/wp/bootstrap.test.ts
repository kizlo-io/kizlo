import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
	wpCli: vi.fn<(args: string[]) => Promise<string>>(),
}))

vi.mock("./docker", () => ({
	compose: vi.fn(),
	composeUp: vi.fn(),
	wpCli: mocks.wpCli,
	wpEval: vi.fn(),
}))

import { installWordPress } from "./bootstrap"

describe("installWordPress", () => {
	beforeEach(() => {
		mocks.wpCli.mockReset().mockResolvedValue("")
	})

	test("passes the admin/admin login to wp core install", async () => {
		await installWordPress("http://localhost:8080", "Kizlo Dev")

		expect(mocks.wpCli).toHaveBeenCalledWith([
			"core",
			"install",
			"--url=http://localhost:8080",
			"--title=Kizlo Dev",
			"--admin_user=admin",
			"--admin_password=admin",
			"--admin_email=admin@example.com",
			"--skip-email",
		])
	})
})

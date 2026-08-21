import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import type { ResolvedDevConfig, ResolvedTestConfig } from "../daemon/config"
import { devStack, testStack } from "./stack"

describe("stack", () => {
	let dir: string

	beforeEach(() => {
		dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-stack-")))
	})

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true })
	})

	function devConfig(wordpressTag: string): ResolvedDevConfig {
		return {
			configDir: dir,
			project: "kizlo-app-dev",
			port: 8080,
			portExplicit: false,
			dbPort: 3307,
			dbPortExplicit: false,
			wordpressTag,
			fixtures: [],
			wordpressPath: ".kizlo/local",
			wordpressDir: path.join(dir, ".kizlo/local"),
		}
	}

	function testConfig(wordpressTag: string): ResolvedTestConfig {
		return {
			configDir: dir,
			local: true,
			project: "kizlo-app-test",
			credentialsPath: path.join(dir, ".kizlo/test.json"),
			port: 8889,
			portExplicit: false,
			wordpressTag,
			fixtures: [],
			packageManager: "pnpm",
		}
	}

	test("carries the configured tag onto the dev stack", () => {
		expect(devStack(devConfig("6.8.2")).wordpressTag).toBe("6.8.2")
	})

	test("carries the configured tag onto the test stack", () => {
		expect(testStack(testConfig("6.8.2-php8.3-apache")).wordpressTag).toBe("6.8.2-php8.3-apache")
	})

	test("keeps dev and test on their own tags", () => {
		expect(devStack(devConfig("7.1.0")).wordpressTag).toBe("7.1.0")
		expect(testStack(testConfig("6.8.2")).wordpressTag).toBe("6.8.2")
	})
})

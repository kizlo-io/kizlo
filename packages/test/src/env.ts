import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = fileURLToPath(new URL(".", import.meta.url))
const CREDENTIALS_PATH = resolve(HERE, "../../../tooling/wp/.test-credentials.json")

interface AdminCredentials {
	username: string
	app_password: string
	wpUserId: number
}

interface CustomerCredentials {
	username: string
	wpUserId: number
}

interface Credentials {
	url: string
	users: {
		admin: AdminCredentials
		customer: CustomerCredentials
	}
	fixtures: { cf7FormId: number; menuId: number }
}

let cached: Credentials | null = null

export function readTestCredentials(): Credentials {
	if (cached) return cached
	const raw = readFileSync(CREDENTIALS_PATH, "utf-8")
	cached = JSON.parse(raw) as Credentials
	return cached
}

export function getWpUrl(): string {
	return process.env.KIZLO_TEST_WP_URL ?? readTestCredentials().url
}

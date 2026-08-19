import fs from "node:fs"
import type { WordPressCredentials } from "../../wordpress/types"
import { resolveTestConfig } from "../daemon/config"
import type { TestCredentials } from "../wp/types"

/** Turn the test harness artifact into the credentials accepted by the introspection transport. */
export function wordPressCredentialsFromTestArtifact(artifact: TestCredentials, project: string): WordPressCredentials {
	if (artifact.project && artifact.project !== project) {
		throw new Error("The saved test credentials belong to another WordPress stack. Run `kizlo test` first.")
	}
	return {
		url: artifact.url,
		username: artifact.users.admin.username,
		password: artifact.users.admin.applicationPassword,
	}
}

/** Read credentials written by `kizlo test`, ensuring they belong to this branch's configured stack. */
export async function testWordPressCredentials(cwd: string): Promise<WordPressCredentials> {
	const config = await resolveTestConfig(cwd)
	let artifact: TestCredentials
	try {
		artifact = JSON.parse(fs.readFileSync(config.credentialsPath, "utf8")) as TestCredentials
	} catch {
		throw new Error("No test WordPress credentials found. Run `kizlo test` first.")
	}
	return wordPressCredentialsFromTestArtifact(artifact, config.project)
}

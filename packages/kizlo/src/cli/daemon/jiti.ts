import { createJiti } from "jiti"

/** Configuration values execute normally; missing imports must fail instead of becoming placeholders. */
export async function importConfigModule<T>(cwd: string, entry: string): Promise<T> {
	const jiti = createJiti(cwd, { moduleCache: false, fsCache: false, tsconfigPaths: true })
	return jiti.import<T>(entry)
}

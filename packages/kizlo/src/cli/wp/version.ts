/**
 * Docker's own tag grammar. Used to validate `dev.version` / `test.version`, so a value that
 * could never name an image is rejected while the config is being read rather than surfacing
 * as a compose pull failure several seconds into a boot.
 */
export const WORDPRESS_TAG_PATTERN = /^[a-zA-Z0-9_][a-zA-Z0-9._-]{0,127}$/

/**
 * The WordPress version a tag names, or `undefined` when it names no version at all
 * (`latest`, `beta`, `php8.3-apache`). Only the leading numeric segments count: everything
 * from the first non-version part on describes the image, not the WordPress in it.
 */
function taggedVersion(tag: string): string | undefined {
	return /^\d+(\.\d+)*/.exec(tag)?.[0]
}

/**
 * Drop trailing zero segments, because the two sides spell the same release differently:
 * Docker tags the release `7.1.0` while `wp core version`, and WordPress itself, call it
 * `7.1`. Comparing the trimmed forms makes those equal without making `7.1.1` equal to either.
 */
function trimZeroes(version: string): string {
	const parts = version.split(".")
	while (parts.length > 1 && parts[parts.length - 1] === "0") parts.pop()
	return parts.join(".")
}

/**
 * Whether WordPress reporting `running` is the WordPress the configured `tag` asks for.
 *
 * True whenever the question can't be answered against the running install rather than false,
 * since this only drives a warning: a tag naming no version (`latest`) is a deliberate "whatever
 * is current", and a partial pin (`7.1`) is satisfied by any patch under it.
 */
export function versionMatchesTag(running: string, tag: string): boolean {
	const wanted = taggedVersion(tag)
	if (!wanted) return true

	const have = trimZeroes(running)
	const want = trimZeroes(wanted)
	return have === want || have.startsWith(`${want}.`)
}

/**
 * Say so when an already-provisioned stack is not running the version its config asks for.
 *
 * Core is copied out of the image once, when the install is created, so a changed `version` does
 * nothing to a stack that already exists: WordPress keeps serving the files it was built from.
 * Only `reset` rebuilds it, and that wipes the database, which is not something to do to someone
 * because they edited a config line. So this reports the disagreement and names the command that
 * resolves it. Best effort: a stack that can't answer `wp core version` has bigger problems, and
 * they surface with a better message somewhere the caller is already looking.
 */
export async function warnVersionDrift(opts: {
	wpCli: (args: string[]) => Promise<string>
	tag: string
	resetCommand: string
	warn: (message: string) => void
}): Promise<void> {
	const running = await opts.wpCli(["core", "version"]).catch(() => "")
	if (!running || versionMatchesTag(running, opts.tag)) return

	opts.warn(
		`This WordPress is running ${running}, but the config asks for ${opts.tag}. ` +
			`It keeps the core it was installed with. \`${opts.resetCommand}\` rebuilds it on the configured version (this wipes the database).`,
	)
}

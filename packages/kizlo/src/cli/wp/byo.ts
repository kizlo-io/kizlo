import { execFileSync } from "node:child_process"
import { cpSync, createReadStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs"
import { join, resolve, sep } from "node:path"
import { createInterface } from "node:readline"

/** Path under the config's `.kizlo/` dir where the dump is staged for import, then deleted. */
const SQL_STAGE_REL = ".kizlo/byo-import.sql"

function tar(args: string[]): string {
	try {
		return execFileSync("tar", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
	} catch (error) {
		const e = error as { stderr?: string; message: string }
		throw new Error(`tar ${args.join(" ")} failed:\n${e.stderr || e.message}`)
	}
}

/** Drop a leading `./` that some tar archives prefix entries with. */
function norm(entry: string): string {
	return entry.replace(/^\.\//, "")
}

/** Move `src` to `dest`, falling back to copy+remove across filesystems (rename's EXDEV). */
function moveInto(src: string, dest: string): void {
	try {
		renameSync(src, dest)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error
		cpSync(src, dest, { recursive: true })
		rmSync(src, { recursive: true, force: true })
	}
}

/**
 * Validate a BYO archive and return the name of its single root-level `.sql` dump. The
 * archive must be a `.tar.gz` holding a top-level `wordpress/` directory and exactly one
 * root-level `*.sql`, and must live outside `wordpressDir` (else `reset`, which wipes
 * that folder, would delete the archive before it could be re-read).
 */
export function validateByoArchive(archivePath: string, wordpressDir: string): string {
	if (!existsSync(archivePath)) throw new Error(`dev.byo archive not found: ${archivePath}`)
	// Any tar archive: `tar` auto-detects the compression on extract (gz/xz/bz2/zst/none)
	// on both GNU tar and bsdtar. `.zip` is excluded — GNU tar on Linux can't read it.
	if (!/\.tar(\.(gz|xz|bz2|zst))?$|\.(tgz|txz|tbz2?|tzst)$/i.test(archivePath)) {
		throw new Error(`dev.byo must be a tar archive (.tar.gz, .tar.xz, .tar.bz2, .tar.zst, .tar): ${archivePath}`)
	}
	if (resolve(archivePath).startsWith(resolve(wordpressDir) + sep)) {
		throw new Error(`dev.byo archive must live outside dev.path — reset would delete it: ${archivePath}`)
	}

	const entries = tar(["-tf", archivePath]).split("\n").map(norm).filter(Boolean)
	if (!entries.some((e) => e === "wordpress/" || e.startsWith("wordpress/"))) {
		throw new Error("dev.byo archive must contain a top-level `wordpress/` directory")
	}
	const sqls = entries.filter((e) => /^[^/]+\.sql$/.test(e))
	if (sqls.length !== 1) {
		throw new Error(`dev.byo archive must contain exactly one root-level .sql file (found ${sqls.length})`)
	}
	return sqls[0] as string
}

/**
 * Detect the dump's table prefix from its `{prefix}options` table — the one table every
 * WordPress install has exactly one of. Streams the file and stops at the first match;
 * falls back to `wp_` when none is found (so a standard dump still imports).
 */
export async function detectTablePrefix(sqlPath: string): Promise<string> {
	const rl = createInterface({ input: createReadStream(sqlPath), crlfDelay: Number.POSITIVE_INFINITY })
	try {
		for await (const line of rl) {
			const match = line.match(/(?:CREATE TABLE(?:\s+IF NOT EXISTS)?|INSERT INTO)\s+`?([0-9a-zA-Z$_]+?)options`?\b/i)
			if (match) return match[1] as string
		}
	} finally {
		rl.close()
	}
	return "wp_"
}

/**
 * Lay a BYO install onto disk before the containers boot: extract the archive, move its
 * `wordpress/` files into `wordpressDir` (dropping the bundled `wp-config.php` — the image
 * regenerates one with the compose DB credentials), stage the dump under `.kizlo/`, and
 * read its table prefix. Returns the prefix (to match the regenerated config) and the host
 * path of the staged dump (the caller pipes it into the `mysql` container, then deletes it).
 */
export async function prepareByo(
	archivePath: string,
	wordpressDir: string,
	configDir: string,
): Promise<{ prefix: string; sqlPath: string }> {
	const sqlName = validateByoArchive(archivePath, wordpressDir)

	const tmp = join(configDir, ".kizlo", "byo-extract")
	rmSync(tmp, { recursive: true, force: true })
	mkdirSync(tmp, { recursive: true })
	try {
		tar(["-xf", archivePath, "-C", tmp])

		mkdirSync(wordpressDir, { recursive: true })
		for (const entry of readdirSync(join(tmp, "wordpress"))) moveInto(join(tmp, "wordpress", entry), join(wordpressDir, entry))
		rmSync(join(wordpressDir, "wp-config.php"), { force: true })

		const sqlPath = join(configDir, SQL_STAGE_REL)
		moveInto(join(tmp, sqlName), sqlPath)
		return { prefix: await detectTablePrefix(sqlPath), sqlPath }
	} finally {
		rmSync(tmp, { recursive: true, force: true })
	}
}

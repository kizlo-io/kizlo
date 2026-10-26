import { randomUUID } from "node:crypto"
import { chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { resolveDevConfig, usesLocalWordPress } from "../daemon/config"
import { acquire, operationLock, releaseOwned } from "../daemon/lock"
import { ownerStatus } from "../process-owner"
import { ensureGitignored } from "../utils"
import { createStack, docker, dockerHint, dockerStatus, type RunResult, runningProjectContainers } from "./docker"
import { projectSession } from "./session"
import { devStack } from "./stack"

const ARCHIVE_SCRIPT = fileURLToPath(new URL("./compose/export.php", import.meta.url))
const COMMAND_TIMEOUT = 15 * 60_000

function checked(result: RunResult, action: string): string {
	if (result.code !== 0) throw new Error(`${action} failed: ${result.stderr || result.stdout || "command interrupted or timed out"}`)
	return result.stdout.trim()
}

export async function endDevSession(project: string, file: string, session = projectSession(project)): Promise<void> {
	if (!session) return
	if (!("token" in session) || !session.token || session.operationFile !== file) {
		if ((await ownerStatus(session)) === "dead") return
		throw new Error("This dev session predates export coordination. Stop it and restart `kizlo dev` with the updated CLI before exporting.")
	}
	if (session.pid === process.pid)
		throw new Error("Cannot export from inside the foreground dev owner. Run `kizlo dev --export` in another terminal.")
	const deadline = Date.now() + 10_000
	let signalled = false
	while (Date.now() < deadline) {
		const status = await ownerStatus(session)
		if (status === "dead") return
		// Only signal a token-verified foreground owner; a missed probe is not proof of exit.
		if (status === "alive" && !signalled) {
			try {
				process.kill(session.pid, "SIGTERM")
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ESRCH") return
				throw error
			}
			signalled = true
		}
		await delay(200)
	}
	throw new Error("Could not confirm dev session shutdown within 10 seconds. Export was cancelled.")
}

export function restoreReadme(metadata: {
	wordpress: string
	database: string
	prefix: string
	home: string
	siteurl: string
	collations: string
}): string {
	return `Kizlo WordPress export

This archive contains private site data and user credentials. Store it securely.
Source WordPress: ${metadata.wordpress}
Source database: ${metadata.database}
Source home URL: ${metadata.home}
Source site URL: ${metadata.siteurl}
Table prefix: ${metadata.prefix}
Source collations: ${metadata.collations}

Manual restore
1. Back up the destination database and files. Install WordPress core separately,
   with compatible PHP and plugins. This archive supplies only wp-content and SQL.
2. Extract the outer ZIP and copy wp-content to the destination WordPress install.
3. Keep database.sql.zip compressed. In phpMyAdmin, select the intended destination
   database (its name may differ from the source), open Import, choose
   database.sql.zip, select SQL format, and import. Do not upload the outer ZIP.
   Import replaces matching tables. Use an account scoped to the destination DB.
4. Keep the destination's own wp-config.php, database connection, salts and server
   configuration. Set its table prefix to the source prefix shown above.
5. Replace each distinct source URL with your destination URL using a
   serialization-aware tool. This is a separate post-import step. For example:
   wp search-replace 'SOURCE_URL' 'DESTINATION_URL' --all-tables --precise --dry-run
   Check the dry run, then repeat without --dry-run. Do not edit serialized SQL
   with text replacement. This export has not rewritten the source database.
6. Check admin login, uploads, active plugins and representative site content.

Compatibility and limits
The SQL is a single-database MySQL dump. The inner ZIP contains only database.sql.
Schema and collations are preserved, so the destination must support the source
schema and collations above. Compressed imports through phpMyAdmin 5.2.3 have been
validated against MySQL 8.4.10 and MariaDB 11.8.9 with utf8mb4_0900_ai_ci and
utf8mb4_unicode_520_ci tables. Other versions/collations need their own check.
DEFINER-bearing views, triggers, routines and events
are rejected rather than silently omitted. A compatible SQL format cannot make an
older database engine accept unsupported collations or features.
PHP/phpMyAdmin upload_max_filesize, post_max_size and execution time limits may
need increasing for a large import. These are separate from database compatibility.
The PHP ZIP writer supports exports up to 4 GiB and 65,535 entries.
See https://docs.phpmyadmin.net/en/latest/import_export.html for import limits.
`
}

/** Export existing data only; provisioning and foreground startup never run on this path. */
export async function exportDev(cwd: string): Promise<string> {
	if (!(await usesLocalWordPress(cwd))) throw new Error("Export requires an enabled local dev WordPress in kizlo.config.ts.")
	const status = await dockerStatus()
	if (status !== "running") throw new Error(dockerHint(status))
	const cfg = await resolveDevConfig(cwd)
	for (const file of ["wp-config.php", "wp-includes/version.php", "wp-content"]) {
		if (!existsSync(join(cfg.wordpressDir, file)))
			throw new Error("No initialized local WordPress site found. Run `kizlo dev` before exporting.")
	}
	const lock = operationLock(cfg.configDir)
	if (!(await acquire(lock))) throw new Error("Another dev operation is active. Wait for it to finish and retry the export.")
	const abort = new AbortController()
	const cancel = (): void => abort.abort(new Error("Export interrupted"))
	const signals = ["SIGINT", "SIGTERM", "SIGHUP"] as const
	for (const signal of signals) process.once(signal, cancel)
	let staging: string | undefined
	let mysql: string | undefined
	let controlled = false
	let containerCreated = false
	let session: ReturnType<typeof projectSession>
	const id = randomUUID()
	const container = `${cfg.project}-export-${id}`
	const workspace = `/tmp/kizlo-export-${id}`
	const dump = `${workspace}.sql`
	const command = async (args: string[], action: string, timeout = COMMAND_TIMEOUT): Promise<string> => {
		abort.signal.throwIfAborted()
		return checked(await docker(args, { signal: abort.signal, timeout }), action)
	}
	let failure: unknown
	let output: string | undefined
	let published = false
	try {
		const ids = await command(
			["ps", "-aq", "--filter", `label=com.docker.compose.project=${cfg.project}`, "--filter", "label=com.docker.compose.service=mysql"],
			"Find existing database",
		)
		if (ids.length === 0 || ids.includes("\n"))
			throw new Error("No unique existing local database container found. Start and stop `kizlo dev` before exporting.")
		mysql = ids
		ensureGitignored(cfg.configDir, ".kizlo/")
		const exportsDir = join(cfg.configDir, ".kizlo/exports")
		mkdirSync(exportsDir, { recursive: true, mode: 0o700 })
		staging = mkdtempSync(join(exportsDir, ".staging-"))
		chmodSync(staging, 0o700)
		// docker cp works on stopped containers. This marker prevents starting an empty volume.
		await command(["cp", `${mysql}:/var/lib/mysql/auto.cnf`, join(staging, "initialized")], "Validate initialized database volume")
		session = projectSession(cfg.project)
		if (session && (await ownerStatus(session)) !== "dead" && (!("token" in session) || session.operationFile !== lock)) {
			throw new Error("Stop the existing dev session and restart it with the updated CLI before exporting.")
		}
		const stack = createStack(devStack(cfg))
		const compose = async (args: string[], action: string): Promise<string> => {
			abort.signal.throwIfAborted()
			return checked(await stack.compose(args, { signal: abort.signal, timeout: COMMAND_TIMEOUT }), action)
		}
		controlled = true
		await compose(["stop", "wordpress", "wp-cli"], "Stop web and background WordPress requests")
		await endDevSession(cfg.project, lock, session)
		await command(["start", mysql], "Start existing database")
		const sql = async (query: string, timeout = COMMAND_TIMEOUT): Promise<string> =>
			command(
				[
					"exec",
					mysql as string,
					"sh",
					"-c",
					'export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"; exec mysql -uroot --batch --raw --skip-column-names --default-character-set=utf8mb4 "$MYSQL_DATABASE" -e "$1"',
					"kizlo-export",
					query,
				],
				"Read source database",
				timeout,
			)
		let ready = false
		const readinessDeadline = Date.now() + 30_000
		while (Date.now() < readinessDeadline) {
			try {
				await sql("SELECT 1", 1_000)
				ready = true
				break
			} catch {
				abort.signal.throwIfAborted()
			}
			await delay(500, undefined, { signal: abort.signal })
		}
		if (!ready) throw new Error("Existing database did not become ready within 30 seconds.")
		const objects = await sql(
			"SELECT CONCAT('trigger: ', TRIGGER_NAME) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() UNION ALL SELECT CONCAT('routine: ', ROUTINE_NAME) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=DATABASE() UNION ALL SELECT CONCAT('event: ', EVENT_NAME) FROM information_schema.EVENTS WHERE EVENT_SCHEMA=DATABASE() UNION ALL SELECT CONCAT('view: ', TABLE_NAME) FROM information_schema.VIEWS WHERE TABLE_SCHEMA=DATABASE()",
		)
		if (objects)
			throw new Error(
				`Database contains objects requiring hosting-specific DEFINER privileges. Export cannot omit them safely:\n${objects}`,
			)
		containerCreated = true
		await compose(
			["run", "-d", "--no-deps", "--name", container, "--user", "0:0", "--entrypoint", "tail", "wp-cli", "-f", "/dev/null"],
			"Start temporary export tooling",
		)
		await command(
			[
				"exec",
				container,
				"php",
				"-r",
				'if (!class_exists("PharData") || !Phar::canCompress(Phar::GZ)) { fwrite(STDERR, "PHP requires PharData and zlib"); exit(1); }',
			],
			"Check PHP ZIP support",
		)
		const prefix = await command(
			["exec", container, "wp", "--allow-root", "config", "get", "table_prefix", "--type=variable"],
			"Read table prefix",
		)
		if (!/^[a-zA-Z0-9_]+$/.test(prefix)) throw new Error("WordPress table prefix is invalid; export cannot read site metadata safely.")
		const metadata = JSON.parse(
			await sql(
				`SELECT JSON_OBJECT('database', VERSION(), 'prefix', '${prefix}', 'home', (SELECT option_value FROM \`${prefix}options\` WHERE option_name='home'), 'siteurl', (SELECT option_value FROM \`${prefix}options\` WHERE option_name='siteurl'), 'collations', (SELECT GROUP_CONCAT(DISTINCT COLLATION_NAME ORDER BY COLLATION_NAME) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()))`,
			),
		)
		const wordpress = await command(
			["exec", container, "php", "-r", 'require "/var/www/html/wp-includes/version.php"; echo $wp_version;'],
			"Read WordPress version",
		)
		writeFileSync(join(staging, "README.txt"), restoreReadme({ ...metadata, wordpress }), { mode: 0o600 })
		await command(
			[
				"exec",
				mysql,
				"sh",
				"-c",
				'umask 077; export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"; exec mysqldump -uroot --single-transaction --quick --skip-lock-tables --skip-add-locks --no-tablespaces --set-gtid-purged=OFF --hex-blob --default-character-set=utf8mb4 --routines --events --triggers --result-file="$1" "$MYSQL_DATABASE"',
				"kizlo-export",
				dump,
			],
			"Dump source database",
		)
		await command(["cp", `${mysql}:${dump}`, join(staging, "database.sql")], "Copy SQL to staging")
		if (!statSync(join(staging, "database.sql")).size) throw new Error("The database dump is empty.")
		await command(["exec", container, "mkdir", "-m", "700", workspace], "Create temporary archive workspace")
		for (const [source, destination] of [
			[join(staging, "database.sql"), "database.sql"],
			[join(staging, "README.txt"), "README.txt"],
			[ARCHIVE_SCRIPT, "export.php"],
		]) {
			await command(["cp", source as string, `${container}:${workspace}/${destination}`], "Copy archive inputs")
		}
		await command(
			["exec", container, "php", "-d", "memory_limit=-1", `${workspace}/export.php`, workspace, "/var/www/html/wp-content"],
			"Build export ZIP",
		)
		await command(["cp", `${container}:${workspace}/site.zip`, join(staging, "site.zip")], "Copy completed export")
		if (!statSync(join(staging, "site.zip")).size) throw new Error("The completed export is empty.")
		output = join(exportsDir, `wordpress-${new Date().toISOString().replaceAll(":", "-")}-${id}.zip`)
	} catch (error) {
		failure = error
	}
	const cleanupErrors: unknown[] = []
	const cleanup = async (args: string[], action: string): Promise<void> => {
		try {
			checked(await docker(args, { timeout: 60_000, detached: true }), action)
		} catch (error) {
			cleanupErrors.push(error)
		}
	}
	if (controlled && mysql) await cleanup(["exec", mysql, "rm", "-f", dump], "Remove temporary SQL")
	if (containerCreated) await cleanup(["rm", "-f", container], "Remove temporary export container")
	if (controlled) {
		try {
			const ids = await runningProjectContainers(cfg.project, { timeout: 60_000 })
			if (ids.length) await cleanup(["stop", ...ids], "Stop local dev stack")
			if ((await runningProjectContainers(cfg.project, { timeout: 60_000 })).length)
				throw new Error("Local dev containers are still running.")
			await endDevSession(cfg.project, lock, session)
		} catch (error) {
			cleanupErrors.push(error)
		}
	}
	try {
		abort.signal.throwIfAborted()
		if (!failure && !cleanupErrors.length && output && staging) {
			chmodSync(join(staging, "site.zip"), 0o600)
			// Hard-link publication is atomic and refuses an existing destination.
			linkSync(join(staging, "site.zip"), output)
			published = true
		}
	} catch (error) {
		failure ??= error
	}
	try {
		if (staging) rmSync(staging, { recursive: true, force: true })
	} catch (error) {
		cleanupErrors.push(error)
	}
	for (const signal of signals) process.removeListener(signal, cancel)
	try {
		await releaseOwned(lock)
	} catch (error) {
		cleanupErrors.push(error)
	}
	if (failure || cleanupErrors.length || !output) {
		if (published && output) rmSync(output, { force: true })
		throw new AggregateError(
			[...(failure ? [failure] : []), ...cleanupErrors],
			[failure instanceof Error ? failure.message : "Export failed", ...cleanupErrors.map(String)].join("\n"),
		)
	}
	return output
}

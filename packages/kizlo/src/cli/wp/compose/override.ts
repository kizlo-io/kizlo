import { mkdirSync, writeFileSync } from "node:fs"
import { basename, dirname, isAbsolute, resolve } from "node:path"
import { OPCACHE_INI, REMAP_ENTRYPOINT } from "../constants"

/** Generated dev override location, relative to the config root. */
const OVERRIDE_REL = ".kizlo/docker-compose.dev.override.yml"
/** Generated test override location (plugin mounts only), relative to the config root. */
const TEST_OVERRIDE_REL = ".kizlo/docker-compose.test.override.yml"

const WP_ROOT = "/var/www/html"
const PLUGINS_DIR = `${WP_ROOT}/wp-content/plugins`
/** Where the dev OPcache config is dropped so the container's PHP picks it up. */
const PHP_CONF_TARGET = "/usr/local/etc/php/conf.d/zz-kizlo-opcache.ini"
/** Where the Linux uid-remap entrypoint is mounted (run via `sh`, so no +x needed). */
const REMAP_TARGET = "/usr/local/bin/kizlo-remap-entrypoint.sh"

export interface DevOverrideOptions {
	/** Absolute host directory the whole WordPress install is bind-mounted to. */
	wordpressDir: string
	/** Local plugin directories to bind-mount into `wp-content/plugins`, by basename. */
	mounts: string[]
	/**
	 * Host user to run the container as (Linux only). When set, www-data is retagged
	 * to this uid/gid so files WordPress writes are owned by the host user. Omitted on
	 * macOS/Windows, where Docker already maps ownership.
	 */
	hostUser?: { uid: number; gid: number }
	/**
	 * Host port to publish the MySQL service on, bound to `127.0.0.1`, so a SQL client
	 * can reach the dev database directly. Omitted leaves MySQL internal-only.
	 */
	dbPort?: number
}

interface ServiceBlock {
	user?: string
	entrypoint?: string[]
	env?: Record<string, string>
	ports?: string[]
	volumes?: string[]
}

function renderService(name: string, block: ServiceBlock): string {
	const lines = [`  ${name}:`]
	if (block.user) lines.push(`    user: "${block.user}"`)
	if (block.entrypoint) lines.push(`    entrypoint: ${JSON.stringify(block.entrypoint)}`)
	if (block.env) {
		lines.push("    environment:")
		for (const [key, value] of Object.entries(block.env)) lines.push(`      ${key}: "${value}"`)
	}
	if (block.ports?.length) lines.push("    ports:", ...block.ports.map((p) => `      - "${p}"`))
	if (block.volumes?.length) lines.push("    volumes:", ...block.volumes)
	return lines.join("\n")
}

/**
 * A compose volume line (`- "host:container"`). `:ro` marks it read-only — the
 * container can read it but never write back to the host file.
 */
function bind(host: string, container: string, readOnly = false): string {
	return `      - "${host}:${container}${readOnly ? ":ro" : ""}"`
}

/** Resolve each local-plugin dir to a volume bind under `wp-content/plugins`, layered by basename. */
function pluginBinds(configDir: string, mounts: string[]): string[] {
	return mounts.map((entry) => bind(isAbsolute(entry) ? entry : resolve(configDir, entry), `${PLUGINS_DIR}/${basename(entry)}`))
}

/**
 * Generate the dev compose override. The whole install is bind-mounted from the
 * host `wordpressDir`, so every file is live and editable; local plugin dirs layer
 * on top by basename; and the dev OPcache config is dropped into PHP (a speed win
 * with live-edit-safe settings). Binds apply to both `wordpress` (serves the site)
 * and `wp-cli` (activates plugins). On Linux (`hostUser` set) the container also
 * runs as the host user so generated files are owned by you, not uid 33. Returns
 * the override path to append to the dev stack's compose files.
 */
export function writeDevOverride(configDir: string, opts: DevOverrideOptions): string {
	const path = resolve(configDir, OVERRIDE_REL)
	mkdirSync(dirname(path), { recursive: true })
	mkdirSync(opts.wordpressDir, { recursive: true })

	const mounts = pluginBinds(configDir, opts.mounts)
	const rootBind = bind(opts.wordpressDir, WP_ROOT)
	const remap = opts.hostUser
		? {
				// Run the wrapper as root so it can retag www-data, then it hands off to
				// the normal entrypoint; wp-cli just runs directly as the host user.
				wordpress: {
					user: "0:0",
					entrypoint: ["sh", REMAP_TARGET],
					env: { KIZLO_PUID: String(opts.hostUser.uid), KIZLO_PGID: String(opts.hostUser.gid) },
					scriptBind: bind(REMAP_ENTRYPOINT, REMAP_TARGET, true),
				},
				wpCliUser: `${opts.hostUser.uid}:${opts.hostUser.gid}`,
			}
		: undefined

	const wordpress: ServiceBlock = {
		user: remap?.wordpress.user,
		entrypoint: remap?.wordpress.entrypoint,
		env: remap?.wordpress.env,
		volumes: [...(remap ? [remap.wordpress.scriptBind] : []), rootBind, ...mounts, bind(OPCACHE_INI, PHP_CONF_TARGET, true)],
	}
	const wpCli: ServiceBlock = { user: remap?.wpCliUser, volumes: [rootBind, ...mounts] }

	// Publish MySQL on a host port (loopback only) so advanced users can point a SQL
	// client at the dev database. Internal-only when no port is configured.
	const services = [renderService("wordpress", wordpress), renderService("wp-cli", wpCli)]
	if (opts.dbPort) services.push(renderService("mysql", { ports: [`127.0.0.1:${opts.dbPort}:3306`] }))

	writeFileSync(path, `services:\n${services.join("\n")}\n`)
	return path
}

/**
 * Generate the test compose override: bind-mount the fixtures' local plugin dirs over
 * `wp-content/plugins` (by basename) on both `wordpress` and `wp-cli`, layered on top of
 * the test stack's `wp_data` volume. Unlike the dev override it touches nothing else —
 * the test stack keeps its volume-backed install, OPcache, and default entrypoints — so a
 * fixture carrying a `{ path }` plugin runs against your live source with no build/zip
 * step, exactly as in `kizlo dev`. Returns the override path to append to the test stack's
 * compose files.
 */
export function writeTestOverride(configDir: string, mounts: string[]): string {
	const path = resolve(configDir, TEST_OVERRIDE_REL)
	mkdirSync(dirname(path), { recursive: true })

	const binds = pluginBinds(configDir, mounts)
	const services = [renderService("wordpress", { volumes: binds }), renderService("wp-cli", { volumes: binds })]

	writeFileSync(path, `services:\n${services.join("\n")}\n`)
	return path
}

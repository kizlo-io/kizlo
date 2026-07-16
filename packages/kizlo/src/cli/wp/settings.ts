import { type WordPressCredentials, WordPressService, WP_KIZLO_BASE } from "../../wordpress"

/** Site-level settings the CLI pushes into the plugin so it can reach and trust the Kizlo server. */
export interface SiteSettingsSync {
	/** Shared key for signing/verifying webhooks. */
	secret?: string
	/**
	 * The Kizlo backend URL (where the handler is mounted). Set verbatim as the plugin's `backend_url`
	 * — that's where webhook events are delivered — and its origin is the default site `url`.
	 */
	backendUrl?: string
	/**
	 * Canonical public site URL → plugin `url`. Overrides `origin(backendUrl)` when set, so a split
	 * deployment (backend on a different host than the site) points the plugin at the right frontend.
	 */
	siteUrl?: string
	/**
	 * The WordPress site runs in the dev Docker stack while the Kizlo server runs on the host. A loopback
	 * `backendUrl` host (`localhost`/`127.0.0.1`) is unreachable from inside the container, so `backend_url`
	 * is rewritten to `host.docker.internal` for delivery. The public `url` keeps the original host (the
	 * browser-facing origin). Set for the local dev/provision stack; left off for real remote sites.
	 */
	containerized?: boolean
}

/** Loopback hosts that, from inside the dev Docker stack, must be rewritten to reach the host. */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"])

/** The origin of a URL (scheme + host + port), or undefined when it can't be parsed. */
function originOf(url: string): string | undefined {
	try {
		return new URL(url).origin
	} catch {
		return undefined
	}
}

/**
 * Rewrite a loopback host to `host.docker.internal` so the dockerized WordPress dev stack can reach a
 * Kizlo server on the host (the container's own `localhost` is not the host). Non-loopback hosts (real
 * deployments) and unparseable URLs are returned unchanged.
 */
function toContainerHostUrl(url: string): string {
	try {
		const parsed = new URL(url)
		if (!LOOPBACK_HOSTS.has(parsed.hostname)) return url
		parsed.hostname = "host.docker.internal"
		return parsed.toString()
	} catch {
		return url
	}
}

/**
 * Push site-level settings into the WordPress plugin's `kizlo_settings_site` option: the shared
 * `secret` (so webhook signing/verification share a key) plus the `url`/`backend_url` the plugin
 * needs to reach the Kizlo server when delivering events. `backend_url` is the backend URL verbatim;
 * `url` is an explicit `siteUrl` when given (split deployments), otherwise the backend's origin (the
 * single-origin default used by dev + local provision). `PUT /kizlo/v1/settings/site` merges, so
 * sending only the keys we have is a safe partial update that leaves other site settings intact;
 * empty fields are omitted. Best-effort: the plugin may not be active yet (remote `init`), so
 * failures are returned, never thrown.
 */
export async function syncSiteSettings(
	credentials: WordPressCredentials,
	settings: SiteSettingsSync,
): Promise<{ ok: boolean; error?: string }> {
	const body: Record<string, string> = {}
	if (settings.secret) body.secret = settings.secret
	const url = settings.siteUrl ?? (settings.backendUrl ? originOf(settings.backendUrl) : undefined)
	if (settings.backendUrl) body.backend_url = settings.containerized ? toContainerHostUrl(settings.backendUrl) : settings.backendUrl
	if (url) body.url = url

	const service = new WordPressService({ credentials })
	const response = await service.put("settings/site", { base: WP_KIZLO_BASE, body })
	if (response.error) return { ok: false, error: describeError(response.status, response.error) }
	return { ok: true }
}

/**
 * A short, log-friendly summary of a failed request. A transport failure has no HTTP status (`0`), so
 * its message (e.g. `fetch failed`) is the only signal; otherwise the status code is shown — the raw
 * `error.message` can be a full HTML page (when the URL serves the frontend instead of WordPress) and
 * would flood the warning.
 */
function describeError(status: number, error: { code: string; message: string }): string {
	if (status === 0) return error.message
	return `HTTP ${status}`
}

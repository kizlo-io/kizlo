import type { Media } from "@kizlo/shared"
import type { BrandSettings } from "../settings/service.interface"

/** Raster mimes: the only sources iOS home-screen icons can render. */
const RASTER_MIMES = new Set(["image/png", "image/jpeg"])

/** Scalable icon mime, valid in `rel=icon` and modern web manifests. */
const SVG_MIME = "image/svg+xml"

/** Mimes a web manifest can use: raster plus scalable SVG. `.ico` is excluded. */
const MANIFEST_MIMES = new Set([...RASTER_MIMES, SVG_MIME])

/**
 * Smallest square rendition worth advertising as a manifest icon. 192px is
 * Chrome's minimum installable icon size, so smaller generated copies add no
 * install value; a source below it still falls through to its original.
 */
const MANIFEST_ICON_FLOOR = 192

/** `.ico` self-describes its bundled sizes, so it takes no `sizes` hint. */
const ICO_MIMES = new Set(["image/x-icon", "image/vnd.microsoft.icon"])

export interface IconDescriptor {
	url: string
	/** The attachment's mime, e.g. `image/svg+xml`, mapped to the `type` attribute. */
	type: string
	/** `"any"` for scalable/single sources; omitted for `.ico`. */
	sizes?: string
	/** Media query for scheme-specific variants, e.g. `(prefers-color-scheme: dark)`. */
	media?: string
}

export interface ManifestIcon {
	src: string
	type: string
	sizes: string
	/**
	 * `"maskable"` marks art with a safe zone the launcher may crop to any
	 * adaptive shape; omitted (default `"any"`) sources render uncropped.
	 */
	purpose?: "any" | "maskable"
}

export interface ResolvedIcons {
	/** `rel="icon"` candidates: the light source plus an optional dark variant. */
	icon: IconDescriptor[]
	/** `rel="apple-touch-icon"` candidate (raster-guarded), or empty. */
	appleTouch: IconDescriptor[]
	/**
	 * Web-manifest icon entries (raster or SVG): the square brand icon as the
	 * default `"any"` source — expanded to one entry per real square rendition —
	 * plus the dedicated Android icon as `"maskable"` when provided. Either may
	 * be absent.
	 */
	manifestIcons: ManifestIcon[]
}

function isRaster(media: Media | null | undefined): media is Media {
	return media != null && media.mime !== undefined && RASTER_MIMES.has(media.mime)
}

/** Return the media only when it is a raster the target can render; otherwise null. */
function raster(media: Media | null | undefined): Media | null {
	return isRaster(media) ? media : null
}

/** Return the media only when a web manifest can render it (raster or SVG). */
function manifestSource(media: Media | null | undefined): Media | null {
	return media?.mime && MANIFEST_MIMES.has(media.mime) ? media : null
}

/**
 * A raster source carries real pixel dimensions; use them verbatim so a
 * descriptor never claims a size the image cannot satisfy. Falls back to `"any"`
 * on scalable sources (e.g. SVG) that have no fixed size.
 */
function pixelSize(media: Media): string {
	return media.width && media.height ? `${media.width}x${media.height}` : "any"
}

function toDescriptor(media: Media, extra?: Pick<IconDescriptor, "media">): IconDescriptor {
	return {
		url: media.src,
		type: media.mime ?? "",
		// `.ico` self-describes its bundled sizes, so it takes no hint.
		sizes: media.mime && ICO_MIMES.has(media.mime) ? undefined : pixelSize(media),
		...extra,
	}
}

/**
 * Manifest icon entries for a source. A scalable SVG yields a single `"any"`
 * entry (it covers every size). A raster source expands into its real renditions
 * — the original plus WordPress's generated resizes — keeping only square ones at
 * or above the floor so browsers get genuine 192/512-ish icons; if none qualify
 * (e.g. a non-square upload) the original is used as-is.
 */
function toManifestIcons(media: Media, purpose?: "maskable"): ManifestIcon[] {
	const type = media.mime ?? ""
	const withPurpose = purpose ? { purpose } : {}

	if (media.mime === SVG_MIME) {
		return [{ src: media.src, type, sizes: "any", ...withPurpose }]
	}

	const renditions = [{ src: media.src, width: media.width, height: media.height }, ...(media.variants ?? [])]
	const square = renditions.filter((r) => r.width && r.height && r.width === r.height && r.width >= MANIFEST_ICON_FLOOR)
	const chosen = square.length ? square : [{ src: media.src, width: media.width, height: media.height }]

	const seen = new Set<string>()
	const icons: ManifestIcon[] = []
	for (const r of chosen) {
		const sizes = r.width && r.height ? `${r.width}x${r.height}` : "any"
		if (seen.has(sizes)) continue
		seen.add(sizes)
		icons.push({ src: r.src, type, sizes, ...withPurpose })
	}
	return icons
}

/**
 * Resolve the brand settings into a normalized icon set. Slots that resolve to
 * nothing are simply left out; the consumer only emits what is present.
 */
export function resolveIcons(brand: BrandSettings): ResolvedIcons {
	const icon: IconDescriptor[] = []

	// Light `rel="icon"`: prefer the dedicated favicon, else the square brand icon.
	const light = brand.favicon ?? brand.logo_icon
	if (light) icon.push(toDescriptor(light))

	// Dark variant only when explicitly provided; otherwise the light one covers both.
	if (brand.favicon_dark) {
		icon.push(toDescriptor(brand.favicon_dark, { media: "(prefers-color-scheme: dark)" }))
	}

	// iOS home-screen icon (`apple-touch-icon`): raster-only. Prefer the dedicated
	// slot, else a raster favicon. iOS never crops, so no maskable concern here.
	const apple = raster(brand.ios_app_icon) ?? raster(brand.favicon)
	const appleTouch = apple ? [toDescriptor(apple)] : []

	// Manifest icons (Android + desktop Chrome): raster or SVG.
	//   - The square brand icon (else the favicon) is the default `"any"` entry,
	//     used by desktop and shown uncropped on Android.
	//   - The dedicated Android icon, when present, adds a `"maskable"` entry so
	//     Android can crop it edge-to-edge. We never mark the `"any"` source
	//     maskable, since we cannot know it has a safe zone.
	const manifestIcons: ManifestIcon[] = []
	const anySource = manifestSource(brand.logo_icon) ?? manifestSource(brand.favicon)
	if (anySource) manifestIcons.push(...toManifestIcons(anySource))

	const maskable = manifestSource(brand.android_app_icon)
	if (maskable) manifestIcons.push(...toManifestIcons(maskable, "maskable"))

	return { icon, appleTouch, manifestIcons }
}

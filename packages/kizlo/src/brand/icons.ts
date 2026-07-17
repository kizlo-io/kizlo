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
}

export interface ManifestIcon {
	src: string
	type: string
	sizes: string
}

export interface ResolvedIcons {
	/**
	 * `rel="icon"` candidate: a single scheme-agnostic source, or empty. Browsers
	 * disagree on scheme-swapping favicons (Safari ignores the `media` attribute
	 * and never re-evaluates an SVG's internal `@media`), so one icon that reads
	 * on both light and dark tab bars is the only cross-browser-safe surface.
	 */
	icon: IconDescriptor[]
	/** `rel="apple-touch-icon"` candidate (raster-guarded), or empty. */
	appleTouch: IconDescriptor[]
	/**
	 * Web-manifest icon entries (raster or SVG): a single square source —
	 * expanded to one entry per real square rendition — that every non-iOS
	 * install surface (Android, Chrome, macOS Safari) renders uncropped. Absent
	 * when no manifest-compatible source exists.
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

/**
 * Append the attachment id as a `?v=` cache-buster. Safari (and every browser)
 * keys its favicon cache by URL, so tying the version to the attachment id means
 * the URL changes when a different icon is chosen — busting the stale cache —
 * while staying stable across renders when the icon is unchanged.
 */
function versioned(src: string, id: number): string {
	return `${src}${src.includes("?") ? "&" : "?"}v=${id}`
}

function toDescriptor(media: Media): IconDescriptor {
	return {
		url: versioned(media.src, media.id),
		type: media.mime ?? "",
		sizes: media.mime && ICO_MIMES.has(media.mime) ? undefined : pixelSize(media),
	}
}

/**
 * Manifest icon entries for a source. A scalable SVG yields a single `"any"`
 * entry (it covers every size). A raster source expands into its real renditions
 * — the original plus WordPress's generated resizes — keeping only square ones at
 * or above the floor so browsers get genuine 192/512-ish icons; if none qualify
 * (e.g. a non-square upload) the original is used as-is.
 */
function toManifestIcons(media: Media): ManifestIcon[] {
	const type = media.mime ?? ""

	if (media.mime === SVG_MIME) {
		return [{ src: media.src, type, sizes: "any" }]
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
		icons.push({ src: r.src, type, sizes })
	}
	return icons
}

/**
 * Resolve the brand settings into a normalized icon set. Slots that resolve to
 * nothing are simply left out; the consumer only emits what is present.
 */
export function resolveIcons(brand: BrandSettings): ResolvedIcons {
	// One unconstrained favicon, no `prefers-color-scheme` swap. Chrome honors a
	// scheme-scoped `media` on `rel=icon`, but Safari ignores it and shows the
	// last-declared icon in every scheme, so a light/dark pair renders wrong there.
	// A single icon that reads on both tab backgrounds is the safe surface.
	const icon: IconDescriptor[] = []
	const primary = brand.favicon ?? brand.logo_icon
	if (primary) icon.push(toDescriptor(primary))

	// iOS/iPadOS Safari is the only surface that reads apple-touch-icon; it must
	// be a raster (Apple ignores SVG here), so fall back to the favicon raster.
	const apple = raster(brand.app_icon) ?? raster(brand.favicon)
	const appleTouch = apple ? [toDescriptor(apple)] : []

	// Every non-iOS install surface (Android, Chrome, macOS Safari) reads the
	// manifest. A single uncropped source keeps them all consistent, so emit one
	// `"any"` icon and no `"maskable"` variant (browsers diverge on which they
	// pick, which is the inconsistency we're avoiding).
	const manifestIcons: ManifestIcon[] = []
	const anySource = manifestSource(brand.app_icon) ?? manifestSource(brand.logo_icon) ?? manifestSource(brand.favicon)
	if (anySource) manifestIcons.push(...toManifestIcons(anySource))

	return { icon, appleTouch, manifestIcons }
}

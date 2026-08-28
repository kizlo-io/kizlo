import { describe, expect, expectTypeOf, test } from "vitest"
import { Media, MediaAudio, MediaFile, MediaImage, type Media as MediaType, MediaVideo } from "./schema"

const base = { id: 12, name: "Attachment", src: "https://example.test/attachment" }

describe("Media", () => {
	test("parses every discriminated member", () => {
		expect(Media.parse({ ...base, type: "image", alt: "Cover", width: 1200, height: 630 })).toMatchObject({ type: "image" })
		expect(Media.parse({ ...base, type: "video", duration: 90, width: 1920, height: 1080 })).toMatchObject({ type: "video" })
		expect(Media.parse({ ...base, type: "audio", duration: 240 })).toMatchObject({ type: "audio" })
		expect(Media.parse({ ...base, type: "file", mime: "application/pdf" })).toMatchObject({ type: "file" })
	})

	test("keeps image-only properties off every non-image schema", () => {
		for (const [schema, type] of [
			[MediaVideo, "video"],
			[MediaAudio, "audio"],
			[MediaFile, "file"],
		] as const) {
			expect(schema.safeParse({ ...base, type, alt: "No" }).success).toBe(false)
		}
	})

	test("requires image alternative text", () => {
		expect(MediaImage.safeParse({ ...base, type: "image" }).success).toBe(false)
	})

	test("narrows member properties from the discriminator", () => {
		function member(media: MediaType) {
			if (media.type === "image") expectTypeOf(media).toEqualTypeOf<MediaImage>()
			if (media.type === "video") expectTypeOf(media).toEqualTypeOf<MediaVideo>()
			if (media.type === "audio") expectTypeOf(media).toEqualTypeOf<MediaAudio>()
			if (media.type === "file") expectTypeOf(media).toEqualTypeOf<MediaFile>()
		}

		member({ ...base, type: "file" })
	})
})

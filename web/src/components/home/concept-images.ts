import architecture from "../../../public/images/home/concepts/architecture.png"
import development from "../../../public/images/home/concepts/development.png"
import publishing from "../../../public/images/home/concepts/publishing.png"
import types from "../../../public/images/home/concepts/types.png"

const fullWidth =
	"(min-width: 1280px) 1150px, (min-width: 1024px) calc(100vw - 128px), (min-width: 640px) calc(100vw - 80px), calc(100vw - 48px)"
const halfWidth =
	"(min-width: 1280px) 543px, (min-width: 1024px) calc((100vw - 192px) / 2), (min-width: 896px) calc((100vw - 112px) / 2), (min-width: 640px) calc(100vw - 80px), calc(100vw - 48px)"

export const conceptImages = {
	architecture: {
		src: architecture,
		alt: "Concept diagram showing WordPress with the Kizlo plugin connected through typed APIs in the app to a custom frontend.",
		sizes: fullWidth,
	},
	types: {
		src: types,
		alt: "Concept showing a required company_name text field configured for WordPress Posts, type generation, and post.custom.company_name suggested as a string in an editor.",
		sizes: fullWidth,
	},
	publishing: {
		src: publishing,
		alt: "Concept showing the WordPress Preview control opening the same article in a custom frontend.",
		sizes: halfWidth,
	},
	development: {
		src: development,
		alt: "Concept showing npx kizlo dev with project content and npx kizlo test with separate test fixtures, each using its own WordPress environment.",
		sizes: halfWidth,
	},
}

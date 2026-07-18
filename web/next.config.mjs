import { createMDX } from "fumadocs-mdx/next"

const withMDX = createMDX()

/** @type {import('next').NextConfig} */
const config = {
	reactStrictMode: true,
	allowedDevOrigins: ["192.168.0.4", "192.168.0.3"],
	async redirects() {
		return [
			// Bots and SEO tools probe the conventional /sitemap.xml; point them at our real
			// sitemap index. 301, matching how Yoast redirects it on the WordPress side.
			{ source: "/sitemap.xml", destination: "/sitemaps/index.xml", statusCode: 301 },
		]
	},
}

export default withMDX(config)

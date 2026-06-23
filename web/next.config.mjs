import { createMDX } from "fumadocs-mdx/next"

const withMDX = createMDX()

/** @type {import('next').NextConfig} */
const config = {
	reactStrictMode: true,
	allowedDevOrigins: ["192.168.0.4"],
}

export default withMDX(config)

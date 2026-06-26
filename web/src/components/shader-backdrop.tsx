"use client"

import { MeshGradient } from "@paper-design/shaders-react"

export function ShaderBackdrop() {
	return (
		<div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
			<MeshGradient
				className="absolute inset-0 size-full opacity-10"
				colors={["#fff", "#014714", "#000"]}
				distortion={0.6}
				swirl={0.4}
				speed={0.4}
			/>
		</div>
	)
}

"use client"

import { GodRays } from "@paper-design/shaders-react"

export function ShaderBackdrop() {
	return (
		<div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
			<GodRays
				className="absolute inset-0 size-full opacity-60"
				colors={["#a600ff6e", "#6200fff0", "#ffffff", "#33fff5"]}
				colorBack="#000000"
				colorBloom="#0000ff"
				bloom={0.4}
				intensity={0.8}
				density={0.3}
				spotty={0.3}
				midSize={0.2}
				midIntensity={0.4}
				speed={0.75}
				offsetX={-1}
				offsetY={-0.55}
			/>
		</div>
	)
}

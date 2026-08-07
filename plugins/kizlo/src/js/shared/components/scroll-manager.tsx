import { useEffect } from "react"
import { useLocation } from "react-router-dom"

/**
 * Manages scroll position on navigation. With no hash, each page opens at the top
 * (React Router's <ScrollRestoration> only works with a data router, so this covers
 * the <Routes>/<Route> setup). With a hash, it scrolls the matching section into
 * view instead of resetting to the top — this drives the sidebar's section
 * jump-links. Renders nothing.
 */
export function ScrollManager() {
	const { pathname, hash, key } = useLocation()

	useEffect(() => {
		if (hash) {
			const id = hash.slice(1)
			// The target may mount a frame after navigation (fresh page). Try this
			// frame, then once more, before giving up.
			const scroll = () => {
				const el = document.getElementById(id)
				el?.scrollIntoView({ block: "start" })
				return Boolean(el)
			}
			const raf = requestAnimationFrame(() => {
				if (!scroll()) requestAnimationFrame(scroll)
			})
			return () => cancelAnimationFrame(raf)
		}

		window.scrollTo(0, 0)
	}, [pathname, hash, key])

	return null
}

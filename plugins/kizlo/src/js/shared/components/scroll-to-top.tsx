import { useEffect } from "react"
import { useLocation } from "react-router-dom"

/**
 * Resets the scroll position on navigation so each page opens at the top rather
 * than inheriting the previous page's scroll offset. React Router's built-in
 * <ScrollRestoration> only works with a data router, so this covers the
 * <Routes>/<Route> setup. Renders nothing.
 */
export function ScrollToTop() {
	const { pathname } = useLocation()

	useEffect(() => {
		window.scrollTo(0, 0)
	}, [pathname])

	return null
}

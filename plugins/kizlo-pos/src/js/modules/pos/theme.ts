import { useEffect, useRef, useState } from "react"

export type Theme = "light" | "dark"
const preferenceKey = "kizlo-pos:theme"

export function readTheme(): Theme | null {
	try {
		const value = window.localStorage.getItem(preferenceKey)
		return value === "light" || value === "dark" ? value : null
	} catch {
		return null
	}
}

export function systemTheme(): Theme {
	return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function saveTheme(theme: Theme): void {
	try {
		window.localStorage.setItem(preferenceKey, theme)
	} catch {
		// The in-memory choice still works when browser storage is unavailable.
	}
}

export function useTheme(): [Theme, () => void] {
	const preference = useRef(readTheme())
	const [theme, setTheme] = useState<Theme>(() => preference.current ?? systemTheme())
	useEffect(() => {
		const media = window.matchMedia?.("(prefers-color-scheme: dark)")
		const update = () => {
			if (preference.current === null) setTheme(systemTheme())
		}
		media?.addEventListener("change", update)
		return () => media?.removeEventListener("change", update)
	}, [])
	return [
		theme,
		() => {
			const next = theme === "dark" ? "light" : "dark"
			preference.current = next
			saveTheme(next)
			setTheme(next)
		},
	]
}

import type { ScreenId } from "./bootstrap"

export function Icon({ name }: { name: ScreenId | "more" | "sun" | "moon" | "arrow" | "flashlight" }) {
	const paths = {
		products: <path d="M3 7l9-4 9 4-9 4zM3 7v10l9 4 9-4V7M12 11v10M7.5 5l9 4" />,
		sell: <path d="M5 5h2l2 11h10l2-8H8M10 20h.01M18 20h.01M14 3v6M11 6h6" />,
		orders: <path d="M7 3h10v3h3v15H4V6h3M7 3v5h10V3M8 12h8M8 16h5" />,
		settings: (
			<>
				<path d="M12 3l2 3 4-.2.2 4 2.8 2.2-2.8 2.2-.2 4-4-.2-2 3-2-3-4 .2-.2-4L3 12l2.8-2.2.2-4 4 .2z" />
				<circle cx="12" cy="12" r="3" />
			</>
		),
		more: (
			<>
				<circle cx="5" cy="12" r="1" />
				<circle cx="12" cy="12" r="1" />
				<circle cx="19" cy="12" r="1" />
			</>
		),
		sun: (
			<>
				<circle cx="12" cy="12" r="4" />
				<path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" />
			</>
		),
		moon: <path d="M20 14A8.5 8.5 0 0110 4a8.5 8.5 0 1010 10z" />,
		flashlight: <path d="M6 3h12v4l-3 4v10H9V11L6 7zM6 7h12M12 13v3" />,
		arrow: <path d="M5 12h14M14 7l5 5-5 5" />,
	}
	return (
		<svg
			width="22"
			height="22"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.6"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			{paths[name]}
		</svg>
	)
}

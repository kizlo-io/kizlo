declare global {
	interface Window {
		wp: {
			media: any
		}
	}

	interface WpMediaFrame {
		open(): void
		on(event: "select", callback: () => void): void
		state(): {
			get(key: "selection"): {
				first(): { toJSON(): any }
				map(cb: (item: any) => any): any[]
			}
		}
	}
}

export {}

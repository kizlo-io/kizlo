declare global {
	interface Window {
		wp: {
			media: any
		}
		_wpPluploadSettings?: {
			defaults?: {
				filters?: {
					max_file_size?: string | number
				}
			}
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

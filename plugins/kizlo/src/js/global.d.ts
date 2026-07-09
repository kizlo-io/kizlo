declare global {
	interface Window {
		wp: {
			media: any
		}
		// Printed by WordPress when the media/upload scripts are enqueued (wp_enqueue_media).
		_wpPluploadSettings?: {
			defaults?: {
				filters?: {
					// The site's max upload size in bytes, suffixed with "b", e.g. "8388608b".
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

declare global {
	interface Window {
		kizloPreview: {
			markDirty: () => void
		}
		kizloPreviewData: {
			ajaxUrl: string
			postId: number
			nonce: string
			isNewPost: boolean
		}
	}
}

export {}

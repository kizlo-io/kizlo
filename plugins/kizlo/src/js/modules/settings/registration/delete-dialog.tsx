import { Modal } from "@wordpress/components"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/shared/components/ui/button"
import { type DeletionProgress, deleteRegistration, processDeletion, type RegistrationKind, refreshSettings, retryDeletion } from "./lib"

const ITEM_NOUN: Record<RegistrationKind, string> = {
	post_types: "entries",
	taxonomies: "terms",
}

export function DeleteRegistration({
	kind,
	slug,
	name,
	onDeleted,
}: {
	kind: RegistrationKind
	slug: string
	name: string
	onDeleted: () => void
}) {
	const [open, setOpen] = useState(false)
	const [busy, setBusy] = useState(false)
	const [progress, setProgress] = useState<DeletionProgress | null>(null)

	const noun = ITEM_NOUN[kind]

	async function finish() {
		await refreshSettings()
		setOpen(false)
		toast.success("Definition deleted.")
		onDeleted()
	}

	async function keepItems() {
		setBusy(true)
		try {
			await deleteRegistration(kind, slug, "keep_items")
			await finish()
		} catch {
			toast.error("Could not delete the definition.")
			setBusy(false)
		}
	}

	async function drain(initial: DeletionProgress) {
		let current = initial
		setProgress(current)

		while (!current.complete && current.remaining > 0) {
			current = await processDeletion(kind, slug)
			setProgress(current)
		}

		if (current.complete) {
			await finish()
		} else {
			// Ran out of items to process but some failed.
			setBusy(false)
		}
	}

	async function deleteItems() {
		setBusy(true)
		try {
			await drain(await deleteRegistration(kind, slug, "delete_items"))
		} catch {
			toast.error("Deletion failed. You can retry the remaining items.")
			setBusy(false)
		}
	}

	async function retry() {
		setBusy(true)
		try {
			await drain(await retryDeletion(kind, slug))
		} catch {
			toast.error("Retry failed.")
			setBusy(false)
		}
	}

	return (
		<>
			<Button type="button" variant="secondary" className="text-red-700!" onClick={() => setOpen(true)}>
				Delete definition…
			</Button>

			{open ? (
				<Modal title={`Delete ${name}`} onRequestClose={() => (busy ? null : setOpen(false))} shouldCloseOnClickOutside={!busy}>
					<div className="flex max-w-lg flex-col gap-4">
						{progress ? (
							<DeletionStatus progress={progress} noun={noun} busy={busy} onRetry={retry} />
						) : (
							<>
								<p className="m-0 text-neutral-700 text-sm">
									This permanently removes the <strong>{name}</strong> definition. There is no trash. Choose what happens to its {noun}.
								</p>

								<div className="flex flex-col gap-3">
									<button
										type="button"
										disabled={busy}
										onClick={keepItems}
										className="cursor-pointer rounded-md border border-neutral-200 bg-white p-4 text-left transition-colors hover:bg-neutral-50 disabled:opacity-50"
									>
										<div className="font-medium text-neutral-900 text-sm">Delete definition, keep {noun}</div>
										<div className="mt-1 text-neutral-500 text-xs">
											Unregisters the object but keeps all {noun}, metadata, and Kizlo settings as orphaned data. Recreating the same key
											restores the settings.
										</div>
									</button>

									<button
										type="button"
										disabled={busy}
										onClick={deleteItems}
										className="cursor-pointer rounded-md border border-red-200 bg-white p-4 text-left transition-colors hover:bg-red-50 disabled:opacity-50"
									>
										<div className="font-medium text-red-700 text-sm">Delete definition and {noun}</div>
										<div className="mt-1 text-neutral-500 text-xs">
											Permanently deletes every {noun} in resumable batches, then removes the object's Kizlo settings and definition.
										</div>
									</button>
								</div>

								<div className="flex justify-end">
									<Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
										Cancel
									</Button>
								</div>
							</>
						)}
					</div>
				</Modal>
			) : null}
		</>
	)
}

function DeletionStatus({
	progress,
	noun,
	busy,
	onRetry,
}: {
	progress: DeletionProgress
	noun: string
	busy: boolean
	onRetry: () => void
}) {
	const done = progress.total - progress.remaining
	const pct = progress.total === 0 ? 100 : Math.round((done / progress.total) * 100)
	const hasFailures = progress.failed > 0 && progress.remaining === 0 && !progress.complete

	return (
		<div className="flex flex-col gap-3">
			<p className="m-0 text-neutral-700 text-sm">
				Deleting {noun}: {progress.deleted} of {progress.total}
				{progress.failed > 0 ? ` (${progress.failed} failed)` : ""}.
			</p>

			<div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
				<div className="h-full rounded-full bg-neutral-900 transition-all" style={{ width: `${pct}%` }} />
			</div>

			{hasFailures ? (
				<div className="flex justify-end">
					<Button type="button" onClick={onRetry} disabled={busy}>
						Retry failed
					</Button>
				</div>
			) : null}
		</div>
	)
}

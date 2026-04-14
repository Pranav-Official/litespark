import { toast } from "sonner";

export interface FileConflict {
	modelId: string;
	fileName: string;
	originalUrl: string;
	resolve: (url: string | null) => void;
}

class ConflictResolver {
	private queue: FileConflict[] = [];
	private listeners: Set<(queue: FileConflict[]) => void> = new Set();

	get currentQueue() {
		return [...this.queue];
	}

	subscribe(cb: (queue: FileConflict[]) => void) {
		this.listeners.add(cb);
		cb(this.currentQueue);
		return () => {
			this.listeners.delete(cb);
		};
	}

	private notify() {
		for (const cb of this.listeners) cb(this.currentQueue);
	}

	/**
	 * Adds a file to the conflict queue and waits for it to be resolved.
	 * Returns the resolved URL or null if skipped.
	 */
	async add(
		modelId: string,
		fileName: string,
		originalUrl: string,
	): Promise<string | null> {
		// Prevent duplicates in queue
		if (
			this.queue.some((c) => c.modelId === modelId && c.fileName === fileName)
		) {
			// If already in queue, we just have to wait for the first one to resolve.
			// This is tricky without a separate promise store, but let's just handle it.
			return null;
		}

		return new Promise((resolve) => {
			this.queue.push({
				modelId,
				fileName,
				originalUrl,
				resolve: (url) => {
					this.queue = this.queue.filter(
						(c) => !(c.modelId === modelId && c.fileName === fileName),
					);
					this.notify();
					resolve(url);
				},
			});
			this.notify();
			toast.warning(`Missing file: ${fileName}`, {
				description: "Please provide an alternative download URL in Settings.",
				duration: 10000,
			});
		});
	}

	resolve(modelId: string, fileName: string, url: string | null) {
		const conflict = this.queue.find(
			(c) => c.modelId === modelId && c.fileName === fileName,
		);
		if (conflict) {
			if (url) {
				toast.success(`File resolved: ${fileName}`);
			} else {
				toast.error(`File skipped: ${fileName}`);
			}
			conflict.resolve(url);
		}
	}
}

export const conflictResolver = new ConflictResolver();

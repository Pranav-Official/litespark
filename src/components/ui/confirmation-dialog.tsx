import { AlertCircle, X } from "lucide-react";

interface ConfirmationDialogProps {
	isOpen: boolean;
	title: string;
	description: string;
	onConfirm: () => void;
	onCancel: () => void;
	confirmLabel?: string;
	cancelLabel?: string;
	variant?: "danger" | "warning" | "info";
}

export function ConfirmationDialog({
	isOpen,
	title,
	description,
	onConfirm,
	onCancel,
	confirmLabel = "Confirm",
	cancelLabel = "Cancel",
	variant = "danger",
}: ConfirmationDialogProps) {
	if (!isOpen) return null;

	const variantStyles = {
		danger: "bg-red-500 hover:bg-red-600 text-white",
		warning: "bg-amber-500 hover:bg-amber-600 text-white",
		info: "bg-blue-500 hover:bg-blue-600 text-white",
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
			{/* Backdrop */}
			<button
				type="button"
				className="absolute inset-0 w-full h-full bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 cursor-default"
				onClick={onCancel}
				aria-hidden="true"
				tabIndex={-1}
			/>

			{/* Dialog Content */}
			<div className="relative w-full max-w-md overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl animate-in zoom-in-95 fade-in duration-200">
				<div className="flex items-start gap-4">
					<div
						className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
							variant === "danger"
								? "bg-red-500/10 text-red-500"
								: variant === "warning"
									? "bg-amber-500/10 text-amber-500"
									: "bg-blue-500/10 text-blue-500"
						}`}
					>
						<AlertCircle className="h-6 w-6" />
					</div>
					<div className="flex-1 space-y-1">
						<h3 className="text-lg font-semibold text-zinc-100">{title}</h3>
						<p className="text-sm leading-relaxed text-zinc-400">
							{description}
						</p>
					</div>
					<button
						type="button"
						onClick={onCancel}
						className="absolute top-4 right-4 text-zinc-500 transition-colors hover:text-zinc-300"
					>
						<X className="h-5 w-5" />
					</button>
				</div>

				<div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					<button
						type="button"
						onClick={onCancel}
						className="flex h-9 items-center justify-center rounded-lg border border-zinc-700 bg-transparent px-4 py-2 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
					>
						{cancelLabel}
					</button>
					<button
						type="button"
						onClick={onConfirm}
						className={`flex h-9 items-center justify-center rounded-lg px-4 py-2 text-xs font-medium transition-colors ${variantStyles[variant]}`}
					>
						{confirmLabel}
					</button>
				</div>
			</div>
		</div>
	);
}

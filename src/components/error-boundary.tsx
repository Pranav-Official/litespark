import { AlertCircle, RefreshCw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
	children: ReactNode;
	fallback?: ReactNode;
}

interface State {
	hasError: boolean;
	error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
	public state: State = {
		hasError: false,
		error: null,
	};

	public static getDerivedStateFromError(error: Error): State {
		return { hasError: true, error };
	}

	public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
		console.error("Uncaught error:", error, errorInfo);
	}

	private handleReset = () => {
		this.setState({ hasError: false, error: null });
		window.location.reload();
	};

	public render() {
		if (this.state.hasError) {
			if (this.props.fallback) {
				return this.props.fallback;
			}

			return (
				<div className="flex h-screen flex-1 flex-col items-center justify-center bg-zinc-950 p-6 text-center">
					<div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10">
						<AlertCircle className="h-8 w-8 text-red-500" />
					</div>
					<h2 className="mb-2 text-xl font-semibold text-zinc-100">
						Something went wrong
					</h2>
					<p className="mb-8 max-w-md text-sm text-zinc-500">
						{this.state.error?.message ||
							"An unexpected error occurred. Please try refreshing the page."}
					</p>
					<button
						type="button"
						onClick={this.handleReset}
						className="flex items-center gap-2 rounded-lg bg-zinc-100 px-6 py-3 text-sm font-medium text-zinc-900 transition-colors hover:bg-white"
					>
						<RefreshCw className="h-4 w-4" />
						Refresh Page
					</button>
				</div>
			);
		}

		return this.props.children;
	}
}

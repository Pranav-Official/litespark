import { ChevronDown, Loader2, Search, AlertCircle, Check } from "lucide-react";
import { useCallback, useState } from "react";
import {
  generateDtypeRecord,
  generatePathMap,
  generateRepoFiles,
  scanOnnxFiles,
  type FileGroup,
  type HFRepoFile,
  type QuantSelection,
} from "#/lib/hf-repo";

interface ModelFileSelectorProps {
  modelId: string;
  onSelect: (
    repoFiles: string[] | null,
    pathMap: Record<string, string> | null,
    dtypeRecord: Record<string, string> | null,
  ) => void;
}

export function ModelFileSelector({
  modelId,
  onSelect,
}: ModelFileSelectorProps) {
  const [status, setStatus] = useState<
    "idle" | "scanning" | "scanned" | "error"
  >("idle");
  const [groups, setGroups] = useState<FileGroup[]>([]);
  const [allFiles, setAllFiles] = useState<HFRepoFile[]>([]);
  const [selections, setSelections] = useState<QuantSelection[]>([]);
  const [error, setError] = useState("");

  const handleScan = useCallback(async () => {
    if (!modelId.trim()) return;
    setStatus("scanning");
    setError("");
    try {
      const result = await scanOnnxFiles(modelId.trim());
      setGroups(result.groups);
      setAllFiles(result.allFiles);

      const defaultSelections = result.groups.map((g) => ({
        component: g.component,
        quant: g.quant,
      }));
      setSelections(defaultSelections);

      const repoFiles = generateRepoFiles(result.groups, defaultSelections);
      const pathMap = generatePathMap(repoFiles);
      const dtypeRecord = generateDtypeRecord(defaultSelections, result.groups);
      onSelect(repoFiles, pathMap, dtypeRecord);
      setStatus("scanned");
    } catch (err) {
      setError((err as Error).message);
      setStatus("error");
      onSelect(null, null, null);
    }
  }, [modelId, onSelect]);

  const handleQuantChange = useCallback(
    (component: string, quant: string) => {
      const newSelections = selections.map((s) =>
        s.component === component ? { ...s, quant } : s,
      );
      setSelections(newSelections);
      const repoFiles = generateRepoFiles(groups, newSelections);
      const pathMap = generatePathMap(repoFiles);
      const dtypeRecord = generateDtypeRecord(newSelections, groups);
      onSelect(repoFiles, pathMap, dtypeRecord);
    },
    [groups, selections, onSelect],
  );

  const componentLabel = (c: string) => {
    switch (c) {
      case "embed_tokens":
        return "Token Embeddings";
      case "embed_images":
        return "Vision Encoder";
      case "decoder":
        return "Decoder";
      default:
        return c;
    }
  };

  const quantsForComponent = (component: string) =>
    groups.filter((g) => g.component === component);

  const selectedQuant = (component: string) =>
    selections.find((s) => s.component === component)?.quant;

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  };

  const totalSelectedSize = () => {
    let total = 0;
    for (const sel of selections) {
      const group = groups.find(
        (g) => g.component === sel.component && g.quant === sel.quant,
      );
      if (group) total += group.totalSize;
    }
    return total;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleScan}
          disabled={status === "scanning" || !modelId.trim()}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-700/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "scanning" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="h-3.5 w-3.5" />
          )}
          {status === "scanning"
            ? "Scanning..."
            : status === "scanned"
              ? "Re-scan"
              : "Scan Model Files"}
        </button>
        {status === "scanned" && groups.length > 0 && (
          <span className="flex items-center gap-1 text-xs text-emerald-400">
            <Check className="h-3.5 w-3.5" />
            {allFiles.length} files found
          </span>
        )}
      </div>

      {status === "error" && (
        <div className="flex items-start gap-2 rounded-lg border border-red-800/50 bg-red-900/10 px-3 py-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <div className="text-xs text-red-300">{error}</div>
        </div>
      )}

      {status === "scanned" && groups.length > 0 && (
        <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/30 p-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Available Quant Variants
          </div>

          {["embed_tokens", "embed_images", "decoder"].map((component) => {
            const quants = quantsForComponent(component);
            if (quants.length === 0) return null;
            const current = selectedQuant(component);

            return (
              <div
                key={component}
                className="flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2"
              >
                <span className="min-w-[6rem] text-xs font-medium text-zinc-400">
                  {componentLabel(component)}
                </span>
                <div className="relative">
                  <select
                    value={current || ""}
                    onChange={(e) => handleQuantChange(component, e.target.value)}
                    className="w-28 appearance-none rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 outline-none focus:border-zinc-600"
                  >
                    {quants.map((q) => (
                      <option key={q.quant} value={q.quant}>
                        {q.quant}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-500" />
                </div>
                {current && (
                  <span className="text-[11px] text-zinc-500">
                    {quants
                      .find((q) => q.quant === current)
                      ?.files.filter((f) => f.path.endsWith(".onnx"))
                      .length || 0}{" "}
                    main file
                    {quants
                      .find((q) => q.quant === current)
                      ?.files.filter((f) => !f.path.endsWith(".onnx")).length
                      ? ` + ${quants.find((q) => q.quant === current)?.files.filter((f) => !f.path.endsWith(".onnx")).length} data`
                      : ""}
                    {" · "}
                    {formatSize(
                      quants.find((q) => q.quant === current)?.totalSize || 0,
                    )}
                  </span>
                )}
              </div>
            );
          })}

          <div className="pt-1 text-right text-[11px] text-zinc-500">
            Total: {allFiles.filter((f) => f.path.endsWith(".onnx")).length} files
            {" · "}
            {formatSize(totalSelectedSize())}
          </div>
        </div>
      )}

      {status === "scanned" && groups.length === 0 && (
        <div className="rounded-lg border border-zinc-800 px-3 py-2 text-xs text-zinc-500">
          No supported ONNX components found in repository.
        </div>
      )}
    </div>
  );
}

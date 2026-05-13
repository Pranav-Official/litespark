export interface HFRepoFile {
  path: string;
  size: number;
  type: "file" | "directory";
}

export interface FileGroup {
  component: string;
  quant: string;
  files: HFRepoFile[];
  totalSize: number;
}

export interface QuantSelection {
  component: string;
  quant: string;
}

export async function scanOnnxFiles(
  modelId: string,
): Promise<{ groups: FileGroup[]; allFiles: HFRepoFile[] }> {
  const resp = await fetch(
    `https://huggingface.co/api/models/${modelId}/tree/main/onnx`,
  );
  if (!resp.ok) throw new Error("No onnx/ directory found in repo");
  const entries: HFRepoFile[] = await resp.json();
  const files = entries.filter((f) => f.type === "file");

  const componentMap: Record<string, Record<string, HFRepoFile[]>> = {};

  for (const file of files) {
    const name = file.path.split("/").pop() || file.path;
    const baseName = name.split(".onnx")[0];

    let component: string | null = null;
    let quant = "fp32";

    if (baseName === "embed_tokens" || baseName.startsWith("embed_tokens_")) {
      component = "embed_tokens";
      quant = baseName.replace("embed_tokens_", "") === baseName ? "fp32" : baseName.replace("embed_tokens_", "");
    } else if (baseName === "embed_images" || baseName.startsWith("embed_images_")) {
      component = "embed_images";
      quant = baseName.replace("embed_images_", "") === baseName ? "fp32" : baseName.replace("embed_images_", "");
    } else if (baseName === "vision_encoder" || baseName.startsWith("vision_encoder_")) {
      component = "embed_images";
      quant = baseName.replace("vision_encoder_", "") === baseName ? "fp32" : baseName.replace("vision_encoder_", "");
    } else if (baseName === "decoder_model_merged" || baseName.startsWith("decoder_model_merged_")) {
      component = "decoder";
      quant = baseName.replace("decoder_model_merged_", "") === baseName ? "fp32" : baseName.replace("decoder_model_merged_", "");
    } else if (baseName === "decoder" || baseName.startsWith("decoder_")) {
      component = "decoder";
      quant = baseName.replace("decoder_", "") === baseName ? "fp32" : baseName.replace("decoder_", "");
    } else {
      continue;
    }

    if (!componentMap[component]) componentMap[component] = {};
    if (!componentMap[component][quant]) componentMap[component][quant] = [];
    componentMap[component][quant].push(file);
  }

  const groups: FileGroup[] = [];
  for (const [component, quants] of Object.entries(componentMap)) {
    for (const [quant, compFiles] of Object.entries(quants)) {
      groups.push({
        component,
        quant,
        files: compFiles,
        totalSize: compFiles.reduce((s, f) => s + f.size, 0),
      });
    }
  }

  return { groups, allFiles: files };
}

export function generateRepoFiles(
  groups: FileGroup[],
  selections: QuantSelection[],
): string[] {
  const selectedFiles: string[] = [];
  for (const sel of selections) {
    const group = groups.find(
      (g) => g.component === sel.component && g.quant === sel.quant,
    );
    if (group) {
      for (const file of group.files) {
        selectedFiles.push(file.path);
      }
    }
  }
  return selectedFiles;
}

export function generatePathMap(repoFiles: string[]): Record<string, string> {
  const pathMap: Record<string, string> = {};
  for (const file of repoFiles) {
    const fileName = file.split("/").pop() || file;
    pathMap[fileName] = file;
  }
  return pathMap;
}

export function generateDtypeRecord(
  selections: QuantSelection[],
  groups: FileGroup[],
): Record<string, string> {
  const record: Record<string, string> = {};
  for (const sel of selections) {
    const group = groups.find(
      (g) => g.component === sel.component && g.quant === sel.quant,
    );
    if (!group || group.files.length === 0) continue;
    const firstName =
      group.files.find((f) => f.path.endsWith(".onnx"))?.path.split("/").pop() ||
      group.files[0].path.split("/").pop() ||
      "";
    const baseName = firstName.split(".onnx")[0];
    const componentName = baseName.endsWith("_" + sel.quant)
      ? baseName.slice(0, -(sel.quant.length + 1))
      : baseName;
    record[componentName] = sel.quant;
  }
  return record;
}

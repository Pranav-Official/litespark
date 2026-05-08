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
    let quant: string;

    if (baseName.startsWith("embed_tokens")) {
      component = "embed_tokens";
      quant = baseName.replace("embed_tokens_", "") || "fp32";
    } else if (baseName.startsWith("embed_images")) {
      component = "embed_images";
      quant = baseName.replace("embed_images_", "") || "fp32";
    } else if (baseName.startsWith("decoder")) {
      component = "decoder";
      quant = baseName.replace("decoder_", "") || "fp32";
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

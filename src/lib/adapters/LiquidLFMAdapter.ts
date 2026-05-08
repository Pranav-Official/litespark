import { AutoTokenizer } from "@huggingface/transformers";
import * as ort from "onnxruntime-web/webgpu";
import { BaseAdapter } from "./base";
import type { GenerateOptions, Message, ModelStatus } from "./types";
import type { ModelConfig } from "../model-registry";

const TILE_SIZE = 512;
const PATCH_SIZE = 16;
const MAX_TILES = 10;
const IMAGE_MEAN = 0.5;
const IMAGE_STD = 0.5;
const IMAGE_TOKEN_ID = 396;
const PATCHES_PER_DIM = TILE_SIZE / PATCH_SIZE;
const PATCHES_PER_TILE = PATCHES_PER_DIM * PATCHES_PER_DIM;
const PATCH_PIXELS = PATCH_SIZE * PATCH_SIZE * 3;

function getFileSuffixes(dtype: string) {
  let tokSuffix = "";
  let encSuffix: string;
  let decSuffix: string;

  if (dtype === "q4f16" || dtype === "fp16") {
    tokSuffix = "fp16";
    encSuffix = "fp16";
    decSuffix = dtype === "q4f16" ? "q4" : "fp16";
  } else if (dtype === "q8") {
    encSuffix = "q8";
    decSuffix = "q8";
  } else {
    encSuffix = "q4";
    decSuffix = "q4";
  }

  return { tokSuffix, encSuffix, decSuffix };
}

function tileImage(
  rgba: Uint8Array,
  width: number,
  height: number,
): { tiles: Float32Array[]; masks: bigint[]; shapes: bigint[][] } {
  const tiles: Float32Array[] = [];
  const masks: bigint[] = [];
  const shapes: bigint[][] = [];

  const nTilesH = Math.min(Math.ceil(height / TILE_SIZE), MAX_TILES);
  const nTilesW = Math.min(Math.ceil(width / TILE_SIZE), MAX_TILES);
  let tileCount = 0;

  for (let ty = 0; ty < nTilesH && tileCount < MAX_TILES; ty++) {
    for (let tx = 0; tx < nTilesW && tileCount < MAX_TILES; tx++) {
      const yStart = ty * TILE_SIZE;
      const xStart = tx * TILE_SIZE;
      const tileH = Math.min(TILE_SIZE, height - yStart);
      const tileW = Math.min(TILE_SIZE, width - xStart);

      const tileData = new Float32Array(PATCHES_PER_TILE * PATCH_PIXELS);
      tileData.fill(-IMAGE_MEAN / IMAGE_STD);

      const hPatches = Math.ceil(tileH / PATCH_SIZE);
      const wPatches = Math.ceil(tileW / PATCH_SIZE);

      for (let ph = 0; ph < hPatches; ph++) {
        const pyStart = ph * PATCH_SIZE;
        const patchH = Math.min(PATCH_SIZE, tileH - pyStart);
        for (let pw = 0; pw < wPatches; pw++) {
          const pxStart = pw * PATCH_SIZE;
          const patchW = Math.min(PATCH_SIZE, tileW - pxStart);

          const patchIdx = ph * PATCHES_PER_DIM + pw;
          const patchOffset = patchIdx * PATCH_PIXELS;

          for (let py = 0; py < patchH; py++) {
            for (let px = 0; px < patchW; px++) {
              const srcIdx = 4 * ((yStart + pyStart + py) * width + (xStart + pxStart + px));
              const dstBase = patchOffset + (py * PATCH_SIZE + px) * 3;

              const r = rgba[srcIdx] / 255;
              const g = rgba[srcIdx + 1] / 255;
              const b = rgba[srcIdx + 2] / 255;

              tileData[dstBase] = (r - IMAGE_MEAN) / IMAGE_STD;
              tileData[dstBase + 1] = (g - IMAGE_MEAN) / IMAGE_STD;
              tileData[dstBase + 2] = (b - IMAGE_MEAN) / IMAGE_STD;
            }
          }
        }
      }

      tiles.push(tileData);
      masks.push(BigInt(hPatches * wPatches));
      shapes.push([BigInt(hPatches), BigInt(wPatches)]);
      tileCount++;
    }
  }

  return { tiles, masks, shapes };
}

export class LiquidLFMAdapter extends BaseAdapter {
  private embedTokensSession: ort.InferenceSession | null = null;
  private embedImagesSession: ort.InferenceSession | null = null;
  private decoderSession: ort.InferenceSession | null = null;
  private tokenizer: any = null;

  private hiddenSize = 2048;
  private numKVHeads = 8;
  private headDim = 64;
  private vocabSize = 65536;

  async load(
    config: ModelConfig,
    device: "webgpu" | "wasm",
    onProgress: (
      pct: number,
      status: ModelStatus,
      downloads: Record<string, number>,
    ) => void,
    localFilesOnly?: boolean,
  ) {
    this.config = config;
    this.device = device;
    const cb = this.getProgressCallback();

    this.tokenizer = await AutoTokenizer.from_pretrained(config.id, {
      local_files_only: localFilesOnly,
      progress_callback: (e: any) => cb(e, onProgress),
    });

    this.processor = { tokenizer: this.tokenizer };
    await this.loadChatTemplate();

    const execProviders: ort.InferenceSession.SessionOptions["executionProviders"] =
      device === "webgpu" ? ["webgpu"] : ["wasm"];

    if (config.repoFiles && config.repoFiles.length > 0) {
      await this.loadFromRepoFiles(config.repoFiles, config.id, execProviders, onProgress);
    } else {
      await this.loadWithGuessing(config, execProviders, onProgress);
    }
  }

  private async loadFromRepoFiles(
    repoFiles: string[],
    modelId: string,
    execProviders: ort.InferenceSession.SessionOptions["executionProviders"],
    onProgress: (
      pct: number,
      status: ModelStatus,
      downloads: Record<string, number>,
    ) => void,
  ) {
    const baseUrl = `https://huggingface.co/${modelId}/resolve/main`;
    onProgress(0, "downloading", {});

    const fetchBuf = async (url: string) => {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Failed to fetch: ${url} (${resp.status})`);
      return resp.arrayBuffer();
    };

    const groups: Record<
      string,
      { main?: ArrayBuffer; data: ArrayBuffer[]; dataPaths: string[] }
    > = {};

    const total = repoFiles.length;
    for (let i = 0; i < total; i++) {
      const file = repoFiles[i];
      const url = `${baseUrl}/${file}`;
      const buf = await fetchBuf(url);
      onProgress(
        Math.round(((i + 1) / total) * 100),
        "downloading",
        {},
      );

      const prefix = file.split(".onnx")[0];
      const suffix = file.slice(prefix.length);

      if (!groups[prefix]) groups[prefix] = { data: [], dataPaths: [] };

      if (suffix === ".onnx") {
        groups[prefix].main = buf;
      } else {
        groups[prefix].data.push(buf);
        groups[prefix].dataPaths.push(file);
      }
    }

    onProgress(95, "loading", {});

    const pickBest = (
      entries: [string, (typeof groups)[string]][],
      component: string,
    ): [string, (typeof groups)[string]] | undefined => {
      const matches = entries.filter(([p]) => p.includes(component));
      if (matches.length === 0) return undefined;
      if (component === "embed_tokens") {
        const fp32 = matches.find(
          ([p]) => !p.match(/_(?:fp16|q4|q8|fp32)$/),
        );
        if (fp32) return fp32;
      }
      return matches[0];
    };

    const allEntries = Object.entries(groups).filter(([, g]) => g.main);

    for (const component of ["embed_tokens", "embed_images", "decoder"]) {
      const entry = pickBest(allEntries, component);
      if (!entry) continue;
      const [, group] = entry;
      const main = group.main!;
      const externalData =
        group.data.length > 0
          ? group.data.map((data, idx) => ({
              path: group.dataPaths[idx].split("/").pop() || group.dataPaths[idx],
              data,
            }))
          : undefined;

      if (component === "embed_tokens") {
        this.embedTokensSession = await ort.InferenceSession.create(main, {
          executionProviders: execProviders,
          externalData: externalData as any,
        });
      } else if (component === "embed_images") {
        this.embedImagesSession = await ort.InferenceSession.create(main, {
          executionProviders: execProviders,
          externalData: externalData as any,
        });
      } else if (component === "decoder") {
        this.decoderSession = await ort.InferenceSession.create(main, {
          executionProviders: execProviders,
          externalData: externalData as any,
        });
      }
    }

    onProgress(100, "ready", {});
  }

  private async loadWithGuessing(
    config: ModelConfig,
    execProviders: ort.InferenceSession.SessionOptions["executionProviders"],
    onProgress: (
      pct: number,
      status: ModelStatus,
      downloads: Record<string, number>,
    ) => void,
  ) {
    const dtype = typeof config.dtype === "string" ? config.dtype : "q4f16";
    const { tokSuffix, encSuffix, decSuffix } = getFileSuffixes(dtype);

    const baseUrl = `https://huggingface.co/${config.id}/resolve/main/onnx`;

    onProgress(0, "downloading", {});

    const fetchBuf = async (url: string) => {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Failed to fetch: ${url} (${resp.status})`);
      return resp.arrayBuffer();
    };

    const embedTokensUrl = `${baseUrl}/${tokSuffix ? `embed_tokens_${tokSuffix}` : "embed_tokens"}.onnx`;
    onProgress(5, "downloading", { embed_tokens: 0 });
    const embedTokensBuf = await fetchBuf(embedTokensUrl);
    onProgress(20, "downloading", { embed_tokens: 100 });

    const embedImagesUrl = `${baseUrl}/embed_images_${encSuffix}.onnx`;
    onProgress(25, "downloading", { embed_images: 0 });
    const embedImagesBuf = await fetchBuf(embedImagesUrl);
    onProgress(40, "downloading", { embed_images: 100 });

    const decoderUrl = `${baseUrl}/decoder_${decSuffix}.onnx`;
    onProgress(45, "downloading", { decoder: 0 });
    const decoderBuf = await fetchBuf(decoderUrl);

    const externalData: { path: string; data: ArrayBuffer }[] = [];
    for (let i = 0; i < 10; i++) {
      const suffix = i === 0 ? "" : `_${i}`;
      const dataUrl = `${baseUrl}/decoder_${decSuffix}.onnx_data${suffix}`;
      try {
        const buf = await fetchBuf(dataUrl);
        externalData.push({
          path: `decoder_${decSuffix}.onnx_data${suffix}`,
          data: buf,
        });
      } catch {
        break;
      }
    }
    onProgress(60, "downloading", { decoder: 100 });

    onProgress(65, "loading", {});
    this.embedTokensSession = await ort.InferenceSession.create(
      embedTokensBuf,
      { executionProviders: execProviders },
    );

    this.embedImagesSession = await ort.InferenceSession.create(
      embedImagesBuf,
      { executionProviders: execProviders },
    );

    this.decoderSession = await ort.InferenceSession.create(decoderBuf, {
      executionProviders: execProviders,
      externalData: externalData.length > 0 ? (externalData as any) : undefined,
    });

    onProgress(100, "ready", {});
  }

  async prepareInputs(messages: Message[], _options?: GenerateOptions) {
    const tokenizer = this.tokenizer;
    const formattedMessages = messages.map((msg) => {
      if (typeof msg.content === "string") {
        return { ...msg, content: [{ type: "text" as const, text: msg.content }] };
      }
      return msg;
    });

    const prompt = tokenizer.apply_chat_template(formattedMessages, {
      add_generation_prompt: true,
      tokenize: false,
    });

    let tokenIds = tokenizer.encode(prompt) as number[];

    const imageUrls: string[] = [];
    for (const msg of messages) {
      if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === "image") {
            imageUrls.push(part.image);
          }
        }
      }
    }

    if (imageUrls.length > 0) {
      const imgEncoded = tokenizer.encode("<image>") as number[];
      if (imgEncoded.length !== 1 || imgEncoded[0] !== IMAGE_TOKEN_ID) {
        const fixed: number[] = [];
        for (let i = 0; i < tokenIds.length; i++) {
          if (
            i + imgEncoded.length <= tokenIds.length &&
            imgEncoded.every((v, j) => tokenIds[i + j] === v)
          ) {
            fixed.push(IMAGE_TOKEN_ID);
            i += imgEncoded.length - 1;
          } else {
            fixed.push(tokenIds[i]);
          }
        }
        tokenIds = fixed;
      }
    }

    if (imageUrls.length > 0) {
      const rawImages = await this.getRawImages(imageUrls);
      const allPixelValues: Float32Array[] = [];
      const allMasks: bigint[] = [];
      const allShapes: bigint[][] = [];

      for (const img of rawImages) {
        const rgba = img.data as Uint8Array;
        const { tiles, masks, shapes } = tileImage(
          rgba,
          img.width,
          img.height,
        );
        allPixelValues.push(...tiles);
        allMasks.push(...masks);
        allShapes.push(...shapes);
      }

      const numTiles = allPixelValues.length;
      const flatPixelValues = new Float32Array(numTiles * PATCHES_PER_TILE * PATCH_PIXELS);
      for (let t = 0; t < numTiles; t++) {
        flatPixelValues.set(allPixelValues[t], t * PATCHES_PER_TILE * PATCH_PIXELS);
      }

      const pixelAttentionMask = new BigInt64Array(numTiles * 1024);
      pixelAttentionMask.fill(0n);
      for (let t = 0; t < numTiles; t++) {
        const validPatches = Number(allMasks[t]);
        pixelAttentionMask.fill(1n, t * 1024, t * 1024 + validPatches);
      }

      const spatialShapes = new BigInt64Array(numTiles * 2);
      for (let t = 0; t < numTiles; t++) {
        spatialShapes[t * 2] = allShapes[t][0];
        spatialShapes[t * 2 + 1] = allShapes[t][1];
      }

      const imageOutputs = await this.embedImagesSession!.run({
        pixel_values: new ort.Tensor(
          "float32",
          flatPixelValues,
          [numTiles, PATCHES_PER_TILE, PATCH_PIXELS],
        ),
        pixel_attention_mask: new ort.Tensor(
          "int64",
          pixelAttentionMask,
          [numTiles, 1024],
        ),
        spatial_shapes: new ort.Tensor(
          "int64",
          spatialShapes,
          [numTiles, 2],
        ),
      });

      const imageEmbeds = imageOutputs[Object.keys(imageOutputs)[0]] as ort.Tensor;

      const inputIdsBigInt = new BigInt64Array(tokenIds.map((id: number) => BigInt(id)));
      const tokenOutputs = await this.embedTokensSession!.run({
        input_ids: new ort.Tensor("int64", inputIdsBigInt, [1, tokenIds.length]),
      });
      const tokenEmbeds = tokenOutputs[Object.keys(tokenOutputs)[0]] as ort.Tensor;

      const mergedData = new Float32Array(tokenEmbeds.data as Float32Array);
      const seqLen = tokenIds.length;
      const hiddenSize = this.hiddenSize;
      let imageIdx = 0;
      for (let i = 0; i < seqLen; i++) {
        if (tokenIds[i] === IMAGE_TOKEN_ID && imageIdx < numTiles) {
          const tokenOffset = i * hiddenSize;
          const imgOffset = imageIdx * 256 * 1152;
          const imgData = imageEmbeds.data as Float32Array;
          for (let j = 0; j < 256; j++) {
            if (tokenOffset + j * hiddenSize + 1152 <= mergedData.length) {
              mergedData.set(
                imgData.subarray(imgOffset + j * 1152, imgOffset + (j + 1) * 1152),
                tokenOffset + j * (hiddenSize - 1152),
              );
            }
          }
          imageIdx++;
        }
      }

      const attnMask = new BigInt64Array(seqLen).fill(1n);

      return {
        inputs_embeds: new ort.Tensor("float32", mergedData, [1, seqLen, hiddenSize]),
        attention_mask: new ort.Tensor("int64", attnMask, [1, seqLen]),
        input_ids: tokenIds,
      };
    }

    const inputIdsBigInt = new BigInt64Array(tokenIds.map((id: number) => BigInt(id)));
    const tokenOutputs = await this.embedTokensSession!.run({
      input_ids: new ort.Tensor("int64", inputIdsBigInt, [1, tokenIds.length]),
    });
    const tokenEmbeds = tokenOutputs[Object.keys(tokenOutputs)[0]] as ort.Tensor;

    const attnMask = new BigInt64Array(tokenIds.length).fill(1n);

    return {
      inputs_embeds: tokenEmbeds,
      attention_mask: new ort.Tensor("int64", attnMask, [1, tokenIds.length]),
      input_ids: tokenIds,
    };
  }

  async generate(
    inputs: any,
    onChunk: (text: string) => void,
    signal: AbortSignal,
    options?: GenerateOptions,
  ) {
    const decoder = this.decoderSession!;
    const embedTokens = this.embedTokensSession!;
    const tokenizer = this.tokenizer;

    const inputsEmbeds = inputs.inputs_embeds as ort.Tensor;
    const initSeqLen = inputs.inputs_embeds.dims[1] as number;

    const enableThinking = options?.thinking ?? this.config.thinking.enabled;
    const sampling = this.config.sampling;
    const params = enableThinking
      ? (sampling?.thinking ?? sampling?.nonThinking)
      : sampling?.nonThinking;

    const maxNewTokens = params?.max_new_tokens ?? 1024;
    const temperature = params?.temperature ?? 0.7;
    const eosTokenId = 7;

    const cache: Record<string, ort.Tensor> = {};
    const convInputNames: string[] = [];
    const attnInputNames: string[] = [];

    for (const name of decoder.inputNames) {
      if (["inputs_embeds", "attention_mask", "position_ids"].includes(name)) continue;
      if (name.startsWith("past_conv")) {
        convInputNames.push(name);
        cache[name] = new ort.Tensor(
          "float32",
          new Float32Array(this.hiddenSize * 3),
          [1, this.hiddenSize, 3],
        );
      } else if (name.startsWith("past_key_values")) {
        attnInputNames.push(name);
        cache[name] = new ort.Tensor(
          "float32",
          new Float32Array(0),
          [1, this.numKVHeads, 0, this.headDim],
        );
      }
    }

    const convOutputNames = convInputNames.map((n) =>
      n.replace("past_conv", "present_conv"),
    );
    const attnOutputNames = attnInputNames.map((n) =>
      n.replace("past_key_values", "present"),
    );

    const generatedTokens: number[] = [];
    let currentSeqLen = initSeqLen;
    let embeds = inputsEmbeds;

    for (let step = 0; step < maxNewTokens; step++) {
      if (signal.aborted) break;

      const attnMaskData = new BigInt64Array(currentSeqLen).fill(1n);
      const attnMask = new ort.Tensor("int64", attnMaskData, [1, currentSeqLen]);

      const feed: Record<string, ort.Tensor> = {
        inputs_embeds: embeds,
        attention_mask: attnMask,
        ...cache,
      };

      const outputs = await decoder.run(feed);

      const logitsTensor = outputs[Object.keys(outputs)[0]] as ort.Tensor;
      const logitsData = logitsTensor.data as Float32Array;
      const lastTokenLogits = logitsData.subarray(
        logitsData.length - this.vocabSize,
      );

      let nextToken: number;
      if (temperature > 0 && temperature !== 0) {
        const scaledLogits = new Float32Array(lastTokenLogits.length);
        let maxVal = -Infinity;
        for (let i = 0; i < lastTokenLogits.length; i++) {
          scaledLogits[i] = lastTokenLogits[i] / temperature;
          if (scaledLogits[i] > maxVal) maxVal = scaledLogits[i];
        }

        let expSum = 0;
        for (let i = 0; i < scaledLogits.length; i++) {
          scaledLogits[i] = Math.exp(scaledLogits[i] - maxVal);
          expSum += scaledLogits[i];
        }

        const probs = new Float32Array(scaledLogits.length);
        for (let i = 0; i < scaledLogits.length; i++) {
          probs[i] = scaledLogits[i] / expSum;
        }

        let rand = Math.random();
        nextToken = probs.length - 1;
        for (let i = 0; i < probs.length; i++) {
          rand -= probs[i];
          if (rand <= 0) {
            nextToken = i;
            break;
          }
        }
      } else {
        let maxLogit = -Infinity;
        nextToken = 0;
        for (let i = 0; i < lastTokenLogits.length; i++) {
          if (lastTokenLogits[i] > maxLogit) {
            maxLogit = lastTokenLogits[i];
            nextToken = i;
          }
        }
      }

      generatedTokens.push(nextToken);

      const decoded = tokenizer.decode([nextToken], {
        skip_special_tokens: false,
      }) as string;
      onChunk(decoded);

      if (nextToken === eosTokenId) break;

      for (const name of convOutputNames) {
        if (outputs[name]) {
          const cacheName = name.replace("present_conv", "past_conv");
          cache[cacheName]?.dispose();
          cache[cacheName] = outputs[name] as ort.Tensor;
        }
      }
      for (const name of attnOutputNames) {
        if (outputs[name]) {
          const cacheName = name.replace("present.", "past_key_values.");
          cache[cacheName]?.dispose();
          cache[cacheName] = outputs[name] as ort.Tensor;
        }
      }

      const nextTokenBigInt = new BigInt64Array([BigInt(nextToken)]);
      const nextEmbedsOutput = await embedTokens.run({
        input_ids: new ort.Tensor("int64", nextTokenBigInt, [1, 1]),
      });
      embeds = nextEmbedsOutput[Object.keys(nextEmbedsOutput)[0]] as ort.Tensor;
      currentSeqLen++;
    }

    for (const key of Object.keys(cache)) {
      try {
        cache[key]?.dispose();
      } catch {}
    }

    return {
      text: "",
      usage: { totalTokens: generatedTokens.length },
    };
  }

  dispose() {
    if (this.embedTokensSession) {
      try {
        this.embedTokensSession.release();
      } catch {}
      this.embedTokensSession = null;
    }
    if (this.embedImagesSession) {
      try {
        this.embedImagesSession.release();
      } catch {}
      this.embedImagesSession = null;
    }
    if (this.decoderSession) {
      try {
        this.decoderSession.release();
      } catch {}
      this.decoderSession = null;
    }
    this.tokenizer = null;
    super.dispose();
  }
}

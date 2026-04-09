# LiteSpark

LiteSpark is a chat application that runs AI models locally in the browser using WebGPU or WASM, or connects to cloud providers like OpenAI, Gemini, and OpenRouter.

## installation

```bash
bun install
```

## development

```bash
bun run dev
```

Open http://localhost:3000 in your browser.

## production build

```bash
bun run build
```

Preview the build with:

```bash
bun run preview
```

## usage

### Local models

Switch to local inference mode in Settings. Select a device (WebGPU or CPU). Click "Load" on a model to download it to your browser cache. Once loaded, you can chat with the model entirely offline.

Supported local models:
- Qwen3.5 0.8B (~850 MB)
- Qwen3.5 2B (~2.0 GB)
- Gemma 4 E2B (~2.3 GB)

WebGPU requires a compatible browser (Chrome 113+, Edge 113+, or Firefox with WebGPU enabled).

### Cloud models

Switch to cloud inference mode in Settings. Enter an API key, select a provider, and choose a model.

Cloud providers:
- OpenAI (gpt-4o, gpt-4o-mini, o3-mini, o1)
- Gemini (gemini-2.5-flash, gemini-2.5-pro, gemini-2.0-flash)
- OpenRouter (openai/gpt-4o, anthropic/claude-3.5-sonnet, google/gemini-2.5-flash)

Example API key placeholder: `sk_test_51Mz...`

### Thinking toggle

Some local models support reasoning. Toggle "thinking" in the message input when enabled to see the model's chain-of-thought process.

## tech stack

- React 19
- TanStack Router (file-based routing)
- Tailwind CSS v4
- Vercel AI SDK
- HuggingFace Transformers.js (local inference)
- PGlite (browser SQLite via IndexedDB)

## commands

```bash
bun run dev        # start dev server
bun run build     # production build
bun run preview   # preview build
bun run lint     # biome lint
bun run format   # biome format
bun run check   # biome check
```
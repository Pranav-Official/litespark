# ✨ LiteSpark

**LiteSpark** is a privacy-first AI workspace that runs entirely in your browser. By leveraging the power of **WebGPU** and **WASM**, it brings state-of-the-art AI models to your local hardware, ensuring your conversations stay private, secure, and available even when you're offline.

Need more horsepower? LiteSpark effortlessly bridges the gap between local privacy and cloud intelligence, supporting OpenAI, Gemini, and OpenRouter with a simple toggle.

---

## 🚀 Features

- 🔒 **Privacy-First**: Run local inference models like Qwen and LFM. Your data never leaves your browser.
- ⚡ **WebGPU Accelerated**: Blazing-fast local performance powered by your GPU.
- 📱 **PWA Ready**: Install it as an app for a native experience on desktop and mobile.

---

## 🛠️ Getting Started

### Installation

LiteSpark is built with **Bun** for maximum speed.

```bash
bun install
```

### Development

Start the development server and watch the magic happen:

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📖 How to Use

### 🏠 Local Mode (The Private Way)

1. Head to **Settings** and switch Inference Mode to **Local**.
2. Select your device (**WebGPU** for speed, **CPU** for compatibility).
3. Click **Load** on a model to download it to your browser cache.
4. **Chat freely.** Once loaded, you can turn off your internet and keep talking.

_Supported Models:_

- **LFM 2.5 350M** (~0.5 GB) - Liquid AI's ultra-lightweight and efficient model.
- **Qwen 3.5 0.8B** (~1.0 GB) - The latest Qwen small model, great balance.

### 🛠️ Custom Models (Bring Your Own AI)
LiteSpark isn't limited to the defaults. You can add any compatible ONNX model directly from Hugging Face:
1. Go to **Settings** -> **Add Model**.
2. Paste the Hugging Face Model ID (e.g., `LiquidAI/LFM2.5-350M-ONNX`).
3. Select the correct **Modality** (Text or Vision) and **Model Class**.
4. Click **Add Model Entry** and then **Load**.

Find trending compatible models here: [Hugging Face ONNX Models](https://huggingface.co/models?pipeline_tag=text-generation&library=onnx&sort=trending)

For a detailed list of tested and compatible models, see our [Model Compatibility Guide](./MODEL_COMPATIBILITY.md).

### ☁️ Cloud Mode

Switch to **Cloud** mode in Settings, drop in your API key, and access models like `gpt-4o`, `claude-3.5-sonnet`, or `gemini-2.0-flash`.

---

## 🧱 Tech Stack

- **Frontend**: React 19 + TanStack Router
- **Styling**: Tailwind CSS v4
- **AI Orchestration**: Vercel AI SDK
- **Local Inference**: HuggingFace Transformers.js
- **Database**: PGlite (Postgres in the browser)

---

## ⌨️ Developer Commands

| Command           | Action                           |
| :---------------- | :------------------------------- |
| `bun run dev`     | Start development server         |
| `bun run build`   | Generate production build        |
| `bun run preview` | Preview production build         |
| `bun run check`   | Run Biome linting and formatting |

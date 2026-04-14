# 🧩 Model Compatibility

This document tracks models tested with LiteSpark and their current compatibility status.

## ✅ Drop-In Compatibility
Models that work perfectly out-of-the-box with standard configuration.

| ModelName | Total Params | HuggingFace ModelLink | Tested Quantization Dtypes | Remarks |
| :--- | :--- | :--- | :--- | :--- |
| LFM 2.5 350M | 350M | [onnx-community/LFM2.5-350M-ONNX](https://huggingface.co/onnx-community/LFM2.5-350M-ONNX) | q4 | Liquid AI's ultra-lightweight and efficient model. Optimized for WebGPU. |
| LFM 2.5 1.2B Thinking | 1.2B | [LiquidAI/LFM2.5-1.2B-Thinking-ONNX](https://huggingface.co/LiquidAI/LFM2.5-1.2B-Thinking-ONNX) | q4 | Liquid AI's larger model with thinking/reasoning capabilities. |
| Qwen 3.5 0.8B | 0.8B | [onnx-community/Qwen3.5-0.8B-ONNX](https://huggingface.co/onnx-community/Qwen3.5-0.8B-ONNX) | q4 | The latest Qwen small model, highly capable for its size. The Thinking tags parsing is broken for qwen 3.5 series, animing to fix |
| Gemma 3 270M IT | 270M | [onnx-community/gemma-3-270m-it-ONNX](https://huggingface.co/onnx-community/gemma-3-270m-it-ONNX) | q4 | Google's ultra-compact Gemma 3 model. |
| LFM-2-VL 450M | 450M | [onnx-community/LFM2-VL-450M-ONNX](https://huggingface.co/onnx-community/LFM2-VL-450M-ONNX) | q4 | A very tiny vision-language model from Liquid AI. |


## ⚠️ Compatibility with minor workarounds
Models that require specific configuration changes or have minor issues.

| ModelName | Total Params | HuggingFace ModelLink | Tested Quantization Dtypes | Remarks |
| :--- | :--- | :--- | :--- | :--- |
| LFM 2.5 VL 450M | 450M | [LiquidAI/LFM2.5-VL-450M-ONNX](https://huggingface.co/LiquidAI/LFM2.5-VL-450M-ONNX) | q4 | Requires manual path for external data. If `embed_tokens.onnx_data` is missing, provide the link for [embed_tokens_fp16.onnx_data](https://huggingface.co/LiquidAI/LFM2.5-VL-450M-ONNX/resolve/main/onnx/embed_tokens_fp16.onnx_data) instead. But Otherwise its a really capable VL model |


## ❌ Incompatible
Models that currently do not work due to missing operators or architecture limitations.

| ModelName | Total Params | HuggingFace ModelLink | Tested Quantization Dtypes | Remarks |
| :--- | :--- | :--- | :--- | :--- |
| | | | | |


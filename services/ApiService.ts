
import { ApiProvider, ApiFormat } from "../types";
import { logger } from "./loggerService";

export class ApiService {
  private static instance: ApiService;

  private constructor() { }

  static getInstance() {
    if (!ApiService.instance) {
      ApiService.instance = new ApiService();
    }
    return ApiService.instance;
  }

  private base64ToBlob(base64: string, mime: string) {
    const byteString = atob(base64.split(',')[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mime });
  }

  /**
   * 压缩图片以减少上传体积
   */
  private async compressImage(base64: string, maxWidth = 1024, quality = 0.8): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(base64); // 失败则返回原图
      img.src = base64;
    });
  }

  private async request(provider: ApiProvider, path: string, body: any, timeoutMs: number = 120000) {
    if (!provider || !provider.apiKey || !provider.baseUrl) {
      throw new Error("API 提供商未配置或信息不完整");
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const url = `${provider.baseUrl.replace(/\/$/, '')}${path}`;
      const headers: Record<string, string> = {
        "Authorization": `Bearer ${provider.apiKey}`
      };

      // Logging for debugging
      if (body?.model) {
        logger.info(`API 请求: [${body.model}] -> ${url}`, 'ApiService');
      } else {
        logger.info(`API 请求: ${url}`, 'ApiService');
      }

      // If body is FormData, don't set Content-Type (browser will set it with boundary)
      if (!(body instanceof FormData)) {
        headers["Content-Type"] = "application/json";
      }

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: body instanceof FormData ? body : JSON.stringify(body),
        signal: controller.signal
      });

      const contentType = response.headers.get("content-type");

      if (!response.ok) {
        let errorMessage = `API 请求失败: ${response.status}`;
        try {
          if (contentType && contentType.includes("application/json")) {
            const errorData = await response.json();
            errorMessage = errorData.error?.message || errorData.message || errorMessage;
          } else {
            const text = await response.text();
            errorMessage = `服务器返回非 JSON 错误 (${response.status}): ${text.slice(0, 100)}...`;
          }
        } catch (e) {
          errorMessage = `请求失败 (${response.status}) 且无法解析错误响应`;
        }
        throw new Error(errorMessage);
      }

      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        throw new Error(`服务器未返回 JSON 数据。请检查 API 地址是否正确。返回内容前缀: ${text.slice(0, 50)}...`);
      }

      return await response.json();
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error(`请求超时 (${timeoutMs / 1000}秒)。大图生成可能需要较长时间，请稍后再试或尝试减小尺寸。`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async getPromptTemplate(name: string): Promise<string> {
    try {
      const response = await fetch(`http://localhost:5001/api/prompts/get?name=${name}`);
      if (!response.ok) throw new Error(`Failed to fetch prompt template: ${response.statusText}`);
      const data = await response.json();
      return data.prompt || '';
    } catch (error) {
      console.error('Error fetching prompt template:', error);
      return '';
    }
  }

  async generateImage(prompt: string, config: { ratio: string, model?: string }, provider?: ApiProvider, base64Images?: string | string[], labels?: string[]) {
    if (!provider) throw new Error("未指定 API 提供商");

    if (provider.format === 'openai') {
      const isNanoBanana = (config.model || '').includes('nano-banana');
      const isDoubaoSeedream = (config.model || '').includes('doubao-seedream');

      // Enhance prompt with labels if available
      let enhancedPrompt = prompt;
      if (labels && labels.length > 0 && Array.isArray(base64Images)) {
        // Build a stronger prompt that emphasizes subject preservation
        const labelDescriptions = labels
          .map((label, i) => {
            if (i === 0) {
              // First image is always the PRIMARY SUBJECT - must be preserved exactly
              return `【主体参考 (PRIMARY SUBJECT)】: ${label || '产品主体'} - 必须严格保持此图的主体外形、轮廓、比例、颜色不变。`;
            } else {
              // Other images are ELEMENT/TEXTURE references only
              return `【参考元素 (ELEMENT REF)】: ${label || '风格元素'} - 仅提取其中的图案/纹理/元素，应用到主体上。`;
            }
          })
          .join("\n");

        enhancedPrompt = `你是一个精确的图像编辑助手。
你的任务是：保持主体（图1）完全一致，仅根据指令修改背景、文案或添加装饰元素。

【核心规则 - 必须遵守】
1. **主体锁定**：图1是唯一的主体。你必须100%保留其外形、轮廓、颜色、比例、角度。严禁生成新的主体。
2. **背景隔离**：**完全忽略图1中的背景、文案和光影环境**。仅提取其中的物理产品主体，并将其完美融入到新的作图指令所描述的环境中。
3. **细节继承**：严格继承图1中的所有物理细节、纹理、Logo和材质，不得有任何简化或形变。
4. **元素融合**：其他图片仅作为纹理、Logo或装饰参考，请将其自然融合到图1的主体表面。
5. **视觉统一**：确保最终输出的图像在光影和材质上与作图指令描述的环境保持协调。

【参考图说明】
${labelDescriptions}

【作图指令】
${prompt}

【重要提醒】
请确保输出图像中的主体（图1）与原图在物理特征上完全一致，不要产生任何形变或细节丢失，同时确保背景完全按照作图指令生成。`;
        console.log(`[ApiService] Enhanced prompt for subject preservation: ${enhancedPrompt.substring(0, 300)}...`);
      }

      const body: any = {
        model: config.model || provider.imageModels?.[0] || "nano-banana-2",
        prompt: enhancedPrompt,
        n: 1,
        response_format: "b64_json"
      };

      // Model-specific size handling
      if (isDoubaoSeedream) {
        // Doubao Seedream requires image_size with minimum 3686400 pixels (1920x1920)
        body.image_size = this.mapRatioToSeedreamSize(config.ratio);
      } else if (isNanoBanana) {
        // Nano Banana (Gemini-based) uses aspect_ratio
        body.aspect_ratio = config.ratio;
      } else {
        // Standard OpenAI format uses size
        body.size = this.mapRatioToSize(config.ratio);
      }

      // Handle single image or array of images
      if (base64Images) {
        const imageList = Array.isArray(base64Images) ? base64Images : [base64Images];
        if (imageList.length > 0) {
          if (isNanoBanana && imageList.length >= 1) {
            // Use /v1/images/edits endpoint with FormData as per official bltcy.ai documentation
            // This is the recommended format for multi-image editing
            const formData = new FormData();
            formData.append('model', config.model || 'nano-banana-2');
            formData.append('prompt', enhancedPrompt);
            formData.append('response_format', 'b64_json');
            formData.append('aspect_ratio', config.ratio);

            // Append each image as a separate 'image' field (official format)
            imageList.forEach((img, index) => {
              const blob = this.base64ToBlob(img, img.includes('png') ? 'image/png' : 'image/jpeg');
              formData.append('image', blob, `image${index + 1}.png`);
            });

            console.log(`[ApiService] Using /v1/images/edits with FormData, ${imageList.length} images`);

            // Call the /images/edits endpoint instead of /images/generations
            const data = await this.request(provider, '/images/edits', formData, 600000);

            console.log("Image Edits API Response Keys:", Object.keys(data));
            const imageItem = data.data?.[0];
            if (!imageItem) {
              console.error("Full API Response:", data);
              throw new Error("API 未返回图像数据");
            }

            let result = "";
            if (imageItem.b64_json) {
              const b64 = imageItem.b64_json.trim();
              result = b64.startsWith('data:image') ? b64 : `data:image/png;base64,${b64}`;
            } else if (imageItem.url) {
              result = imageItem.url;
            }

            if (!result) {
              console.error("Invalid Image Item:", imageItem);
              throw new Error("API 未返回有效的图像数据 (b64_json 或 url)");
            }

            console.log("Final Image Result (first 100 chars):", result.substring(0, 100));
            return result;
          } else {
            // Fallback/Standard handling for other models
            // Build contents array in Gemini-native format: [{ text }, { inlineData }, { inlineData }, ...]
            const contents: any[] = [
              { text: enhancedPrompt }
            ];

            imageList.forEach((img) => {
              const base64Data = img.includes(',') ? img.split(',')[1] : img;
              const mimeType = img.includes('png') ? 'image/png' : 'image/jpeg';

              contents.push({
                inlineData: {
                  mimeType: mimeType,
                  data: base64Data
                }
              });
            });

            body.contents = contents;
            body.prompt = enhancedPrompt;
            body.images = imageList;
            body.image = imageList[0];
            body.input_fidelity = 'high';
            body.action = imageList.length > 1 ? 'generate' : 'edit';

            if (imageList.length > 1) {
              body.image_references = imageList.map((img, i) => ({
                image: img,
                weight: 1.0,
                type: i === 0 ? 'subject' : 'style'
              }));
              body.image_weights = imageList.map(() => 1.0);
              body.subject_reference = imageList;
            } else {
              body.image_reference_type = 'subject';
              body.image_weight = 1.0;
            }
          }

          console.log(`Sending ${imageList.length} reference images with ${isNanoBanana ? 'edits FormData' : 'contents'} format (${Math.round(JSON.stringify(imageList).length / 1024)} KB)`);
        }
      }

      console.log("API Request Body (excluding large images):", { ...body, images: body.images?.length, image: body.image ? 'present' : 'absent', contents: body.contents?.length });
      const data = await this.request(provider, '/images/generations', body, 600000); // 10 minutes timeout for image generation

      console.log("Image API Response Keys:", Object.keys(data));
      const imageItem = data.data?.[0];
      if (!imageItem) {
        console.error("Full API Response:", data);
        throw new Error("API 未返回图像数据");
      }

      let result = "";
      if (imageItem.b64_json) {
        const b64 = imageItem.b64_json.trim();
        result = b64.startsWith('data:image') ? b64 : `data:image/png;base64,${b64}`;
      } else if (imageItem.url) {
        result = imageItem.url;
      }

      if (!result) {
        console.error("Invalid Image Item:", imageItem);
        throw new Error("API 未返回有效的图像数据 (b64_json 或 url)");
      }

      console.log("Final Image Result (first 100 chars):", result.substring(0, 100));
      return result;
    } else if (provider.format === 'stability') {
      // Stability AI SDXL / Core API format
      const url = `${provider.baseUrl.replace(/\/$/, '')}/v1/generation/${config.model || 'nano-banana-2-4k'}/text-to-image`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({
          text_prompts: [{ text: prompt }],
          cfg_scale: 7,
          height: this.mapRatioToHeight(config.ratio),
          width: this.mapRatioToWidth(config.ratio),
          steps: 30,
          samples: 1,
        }),
        signal: AbortSignal.timeout(600000) // 10 minutes timeout for stability
      });

      if (!response.ok) throw new Error(`Stability API 错误: ${response.status}`);
      const data = await response.json();
      return `data:image/png;base64,${data.artifacts[0].base64}`;
    }

    throw new Error(`不支持的 API 格式: ${provider.format}`);
  }

  private mapRatioToSize(ratio: string): string {
    const map: Record<string, string> = {
      '1:1': '1024x1024',
      '3:4': '768x1024',
      '4:3': '1024x768',
      '9:16': '1024x1792',
      '16:9': '1792x1024',
      '2:3': '832x1248',
      '3:2': '1248x832',
      '4:5': '896x1120',
      '5:4': '1120x896',
      '21:9': '1792x768'
    };
    return map[ratio] || '1024x1024';
  }

  private mapRatioToWidth(ratio: string): number {
    const map: Record<string, number> = {
      '1:1': 1024, '3:4': 768, '4:3': 1024, '9:16': 1024, '16:9': 1536,
      '2:3': 832, '3:2': 1248, '4:5': 896, '5:4': 1120, '21:9': 1792
    };
    return map[ratio] || 1024;
  }

  private mapRatioToHeight(ratio: string): number {
    const map: Record<string, number> = {
      '1:1': 1024, '3:4': 1024, '4:3': 768, '9:16': 1792, '16:9': 864,
      '2:3': 1248, '3:2': 832, '4:5': 1120, '5:4': 896, '21:9': 768
    };
    return map[ratio] || 1024;
  }

  // Seedream 4.5 requires minimum 3686400 pixels (1920x1920)
  private mapRatioToSeedreamSize(ratio: string): string {
    const map: Record<string, string> = {
      '1:1': '1920x1920',
      '3:4': '1440x1920',
      '4:3': '1920x1440',
      '9:16': '1080x1920',
      '16:9': '1920x1080',
      '2:3': '1280x1920',
      '3:2': '1920x1280',
      '4:5': '1536x1920',
      '5:4': '1920x1536',
      '21:9': '2560x1080'
    };
    return map[ratio] || '1920x1920';
  }

  async chatPro(
    prompt: string,
    model: string,
    provider?: ApiProvider,
    base64Images?: string[],
    systemPrompt?: string,
    history?: { role: 'user' | 'assistant', content: string, images?: string[], imageLabels?: string[] }[],
    imageLabels?: string[]
  ) {
    if (!provider) throw new Error("未指定 API 提供商");

    const messages: any[] = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }

    // Add conversation history
    if (history && history.length > 0) {
      for (const msg of history) {
        if (msg.images && msg.images.length > 0) {
          // Prepend labels to content if available
          let labelContext = "";
          if (msg.imageLabels && msg.imageLabels.some(l => l)) {
            labelContext = "参考图标签：\n" + msg.imageLabels.map((l, i) => `- 图${i + 1}: ${l || '未标注'}`).join('\n') + "\n\n";
          }
          const content: any[] = [{ type: "text", text: labelContext + msg.content }];
          msg.images.forEach(img => {
            content.push({ type: "image_url", image_url: { url: img } });
          });
          messages.push({ role: msg.role, content });
        } else {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    // Add current user message
    let currentLabelContext = "";
    if (imageLabels && imageLabels.some(l => l)) {
      currentLabelContext = "参考图标签：\n" + imageLabels.map((l, i) => `- 图${i + 1}: ${l || '未标注'}`).join('\n') + "\n\n";
    }
    const userContent: any[] = [{ type: "text", text: currentLabelContext + prompt }];
    if (base64Images && base64Images.length > 0) {
      base64Images.forEach(img => {
        userContent.push({ type: "image_url", image_url: { url: img } });
      });
    }

    messages.push({ role: "user", content: userContent });

    const data = await this.request(provider, '/chat/completions', {
      model: model || provider.models[0],
      messages: messages
    });
    return data.choices[0].message.content;
  }

  async optimizePrompt(prompt: string, model: string, provider?: ApiProvider, base64Images?: string[], systemPrompt?: string, imageLabels?: Record<number, string[]>) {
    if (!provider) throw new Error("未指定 API 提供商");

    const messages: any[] = [];

    // 如果提供了自定义提示词工程模板，作为 system 角色
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    } else {
      const defaultPrompt = await this.getPromptTemplate('DEFAULT_OPTIMIZER');
      messages.push({ role: "system", content: defaultPrompt || "You are a prompt engineering expert. Your task is to refine and expand the user's input into a detailed, high-quality prompt suitable for AI image generation. Focus on lighting, composition, style, and technical details." });
    }

    // Prepend image label context if provided
    let enhancedPrompt = prompt;
    if (imageLabels && Object.keys(imageLabels).length > 0) {
      const labelDescriptions = Object.entries(imageLabels)
        .filter(([_, labels]) => labels.length > 0)
        .map(([idx, labels]) => `- 图片${parseInt(idx) + 1}: [${labels.join(', ')}]`)
        .join('\n');
      if (labelDescriptions) {
        enhancedPrompt = `参考图片说明：\n${labelDescriptions}\n\n${prompt}`;
      }
    }

    const userContent: any[] = [{ type: "text", text: enhancedPrompt }];
    if (base64Images && base64Images.length > 0) {
      base64Images.forEach(img => {
        userContent.push({ type: "image_url", image_url: { url: img } });
      });
    }

    messages.push({ role: "user", content: userContent });

    const data = await this.request(provider, '/chat/completions', {
      model: model || provider.models[0],
      messages: messages
    });
    return data.choices[0].message.content;
  }

  async outpaintImage(base64Image: string, prompt: string, outpaintConfig: any, provider?: ApiProvider, model?: string) {
    if (!provider) throw new Error("未指定 API 提供商");

    const { x = 0.5, y = 0.5, ratio = '1:1', scale = 0.8, resolution = '2k', isLocked = false, imageRatio = 1 } = outpaintConfig;

    // 1. Calculate dimensions
    // CRITICAL: When isLocked is true, use the actual image aspect ratio instead of the preset ratio
    let targetWidth: number;
    let targetHeight: number;

    if (isLocked && imageRatio) {
      // Calculate dimensions based on actual image aspect ratio
      const baseSize = 1024;
      if (imageRatio >= 1) {
        targetWidth = baseSize;
        targetHeight = Math.round(baseSize / imageRatio);
      } else {
        targetHeight = baseSize;
        targetWidth = Math.round(baseSize * imageRatio);
      }
    } else {
      targetWidth = this.mapRatioToWidth(ratio);
      targetHeight = this.mapRatioToHeight(ratio);
    }

    // Scale based on resolution
    if (resolution === '2k') {
      targetWidth *= 2;
      targetHeight *= 2;
    } else if (resolution === '4k') {
      targetWidth *= 4;
      targetHeight *= 4;
    }

    // Cap at reasonable limits (e.g., 4096px)
    const maxDim = 4096;
    if (targetWidth > maxDim || targetHeight > maxDim) {
      const factor = maxDim / Math.max(targetWidth, targetHeight);
      targetWidth = Math.round(targetWidth * factor);
      targetHeight = Math.round(targetHeight * factor);
    }

    // 2. Create composed image and mask using a hidden canvas
    const composedData = await this.composeOutpaintCanvas(base64Image, targetWidth, targetHeight, x, y, scale);

    // 3. Call API (using inpainting/edit format)
    // Most providers use the same /images/generations or /images/edits endpoint
    const formData = new FormData();
    formData.append('model', model || provider.imageModels?.[0] || "nano-banana-2");
    formData.append('prompt', prompt || "expand the background seamlessly");
    formData.append('image', this.base64ToBlob(composedData.image, 'image/png'), 'image.png');
    formData.append('mask', this.base64ToBlob(composedData.mask, 'image/png'), 'mask.png');
    formData.append('n', '1');
    formData.append('response_format', 'b64_json');

    // Add aspect ratio for models that need it
    if (model?.includes('nano-banana')) {
      formData.append('aspect_ratio', ratio);
    }

    const data = await this.request(provider, '/images/edits', formData, 600000);
    const imageItem = data.data?.[0];
    if (!imageItem) throw new Error("API 未返回图像数据");

    const b64 = imageItem.b64_json || imageItem.url;
    return b64.startsWith('data:image') ? b64 : `data:image/png;base64,${b64}`;
  }

  private async composeOutpaintCanvas(base64: string, tw: number, th: number, x: number, y: number, scale: number) {
    return new Promise<{ image: string, mask: string }>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        // Create main canvas
        const canvas = document.createElement('canvas');
        canvas.width = tw;
        canvas.height = th;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject("Failed to get canvas context");

        // Fill background with a mid-gray color (helps some models blend better)
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, tw, th);

        // Calculate image size on canvas
        const imgW = tw * scale;
        const imgH = imgW * (img.height / img.width);

        // Position (x, y are normalized centers)
        const posX = tw * x - imgW / 2;
        const posY = th * y - imgH / 2;

        // Draw image
        ctx.drawImage(img, posX, posY, imgW, imgH);
        const imageBase64 = canvas.toDataURL('image/png');

        // Create mask canvas with FEATHERED edges for smooth blending
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = tw;
        maskCanvas.height = th;
        const mctx = maskCanvas.getContext('2d');
        if (!mctx) return reject("Failed to get mask context");

        // Start with white (areas to fill/generate)
        mctx.fillStyle = '#ffffff';
        mctx.fillRect(0, 0, tw, th);

        // Define feather amount (in pixels)
        const feather = Math.min(50, imgW * 0.1, imgH * 0.1);

        // Draw the "keep" area (black) with feathered edges using gradients
        // First, fill the inner area solid black
        const innerX = posX + feather;
        const innerY = posY + feather;
        const innerW = imgW - feather * 2;
        const innerH = imgH - feather * 2;

        if (innerW > 0 && innerH > 0) {
          mctx.fillStyle = '#000000';
          mctx.fillRect(innerX, innerY, innerW, innerH);
        }

        // Create feathered edges using radial gradients at corners and linear gradients on edges
        // Top edge
        const topGrad = mctx.createLinearGradient(0, posY, 0, posY + feather);
        topGrad.addColorStop(0, 'rgba(255,255,255,1)');
        topGrad.addColorStop(1, 'rgba(0,0,0,1)');
        mctx.fillStyle = topGrad;
        mctx.fillRect(innerX, posY, innerW, feather);

        // Bottom edge
        const bottomGrad = mctx.createLinearGradient(0, posY + imgH - feather, 0, posY + imgH);
        bottomGrad.addColorStop(0, 'rgba(0,0,0,1)');
        bottomGrad.addColorStop(1, 'rgba(255,255,255,1)');
        mctx.fillStyle = bottomGrad;
        mctx.fillRect(innerX, posY + imgH - feather, innerW, feather);

        // Left edge
        const leftGrad = mctx.createLinearGradient(posX, 0, posX + feather, 0);
        leftGrad.addColorStop(0, 'rgba(255,255,255,1)');
        leftGrad.addColorStop(1, 'rgba(0,0,0,1)');
        mctx.fillStyle = leftGrad;
        mctx.fillRect(posX, innerY, feather, innerH);

        // Right edge
        const rightGrad = mctx.createLinearGradient(posX + imgW - feather, 0, posX + imgW, 0);
        rightGrad.addColorStop(0, 'rgba(0,0,0,1)');
        rightGrad.addColorStop(1, 'rgba(255,255,255,1)');
        mctx.fillStyle = rightGrad;
        mctx.fillRect(posX + imgW - feather, innerY, feather, innerH);

        // Corner gradients (radial) - simplified approach using overlapping linear gradients
        // Top-left corner
        mctx.save();
        mctx.beginPath();
        mctx.rect(posX, posY, feather, feather);
        mctx.clip();
        const tlGrad = mctx.createRadialGradient(posX + feather, posY + feather, 0, posX + feather, posY + feather, feather * 1.4);
        tlGrad.addColorStop(0, 'rgba(0,0,0,1)');
        tlGrad.addColorStop(1, 'rgba(255,255,255,1)');
        mctx.fillStyle = tlGrad;
        mctx.fillRect(posX, posY, feather, feather);
        mctx.restore();

        // Top-right corner
        mctx.save();
        mctx.beginPath();
        mctx.rect(posX + imgW - feather, posY, feather, feather);
        mctx.clip();
        const trGrad = mctx.createRadialGradient(posX + imgW - feather, posY + feather, 0, posX + imgW - feather, posY + feather, feather * 1.4);
        trGrad.addColorStop(0, 'rgba(0,0,0,1)');
        trGrad.addColorStop(1, 'rgba(255,255,255,1)');
        mctx.fillStyle = trGrad;
        mctx.fillRect(posX + imgW - feather, posY, feather, feather);
        mctx.restore();

        // Bottom-left corner
        mctx.save();
        mctx.beginPath();
        mctx.rect(posX, posY + imgH - feather, feather, feather);
        mctx.clip();
        const blGrad = mctx.createRadialGradient(posX + feather, posY + imgH - feather, 0, posX + feather, posY + imgH - feather, feather * 1.4);
        blGrad.addColorStop(0, 'rgba(0,0,0,1)');
        blGrad.addColorStop(1, 'rgba(255,255,255,1)');
        mctx.fillStyle = blGrad;
        mctx.fillRect(posX, posY + imgH - feather, feather, feather);
        mctx.restore();

        // Bottom-right corner
        mctx.save();
        mctx.beginPath();
        mctx.rect(posX + imgW - feather, posY + imgH - feather, feather, feather);
        mctx.clip();
        const brGrad = mctx.createRadialGradient(posX + imgW - feather, posY + imgH - feather, 0, posX + imgW - feather, posY + imgH - feather, feather * 1.4);
        brGrad.addColorStop(0, 'rgba(0,0,0,1)');
        brGrad.addColorStop(1, 'rgba(255,255,255,1)');
        mctx.fillStyle = brGrad;
        mctx.fillRect(posX + imgW - feather, posY + imgH - feather, feather, feather);
        mctx.restore();

        const maskBase64 = maskCanvas.toDataURL('image/png');

        resolve({
          image: imageBase64,
          mask: maskBase64
        });
      };
      img.onerror = reject;
      img.src = base64;
    });
  }

  // 临时保留占位，后续可根据需要实现
  async generateVideo(prompt: string, provider?: ApiProvider) { throw new Error("当前提供商不支持视频生成"); }
  async generateTTS(text: string, voice: string, provider?: ApiProvider) { throw new Error("当前提供商不支持 TTS"); }
  async editImage(base64Image: string, prompt: string, provider?: ApiProvider) { throw new Error("当前提供商不支持图像编辑"); }
  async searchGrounding(prompt: string, provider?: ApiProvider, systemPrompt?: string) {
    // For now, we use chatPro with a search-oriented system prompt if none provided
    const defaultSystem = await this.getPromptTemplate('DEFAULT_SEARCH') || "You are a search assistant. Use real-time information to answer the user's request accurately.";
    return this.chatPro(prompt, 'gemini-3-flash-preview', provider, [], systemPrompt || defaultSystem);
  }
  async analyzeImage(base64Images: string[], prompt: string, provider?: ApiProvider, model?: string, imageLabels?: Record<number, string[]>) {
    const defaultSystem = await this.getPromptTemplate('DEFAULT_ANALYSIS') || "You are a visual analysis expert. Describe the provided images accurately and thoroughly.";
    return this.optimizePrompt(prompt || "Analyze these images in detail.", model || '', provider, base64Images, defaultSystem, imageLabels);
  }
}

export const apiService = ApiService.getInstance();
export const decodeBase64 = (base64: string) => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};
export const encodeBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};
export async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

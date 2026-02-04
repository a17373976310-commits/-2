
import { ApiProvider, ApiFormat } from "../types";
import { logger } from "./loggerService";

export class ApiService {
  private static instance: ApiService;
  private imageCache = new Map<string, string>();

  private constructor() { }

  static getInstance() {
    if (!ApiService.instance) {
      ApiService.instance = new ApiService();
    }
    return ApiService.instance;
  }

  private async imageToBlob(imageData: string, defaultMime = 'image/png'): Promise<Blob> {
    if (imageData.startsWith('http')) {
      try {
        const response = await fetch(imageData);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.blob();
      } catch (e) {
        console.error("Failed to fetch image from URL:", imageData, e);
        throw new Error("无法从链接获取参考图片。请尝试重新上传或检查链接。");
      }
    }

    // Use fetch to decode data URLs - much more robust than atob
    const dataUrl = imageData.startsWith('data:') ? imageData : `data:${defaultMime};base64,${imageData}`;
    try {
      const response = await fetch(dataUrl);
      if (!response.ok) throw new Error("Fetch failed on data URL");
      return await response.blob();
    } catch (e) {
      // Fallback to manual decoding if fetch on data URL fails (unlikely in modern browsers)
      try {
        const base64Data = imageData.includes(',') ? imageData.split(',')[1] : imageData;
        const byteString = atob(base64Data.trim().replace(/\s/g, ''));
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i);
        }
        return new Blob([ab], { type: defaultMime });
      } catch (err) {
        console.error("Image decoding failed:", err);
        throw new Error("图片数据解析失败。请确保图片格式正确。");
      }
    }
  }

  /**
   * 压缩图片以减少上传体积
   */
  private async compressImage(base64: string, maxWidth = 1024, quality = 0.8): Promise<string> {
    // 如果 base64 小于 100KB，直接返回
    if (base64.length < 100000) return base64;

    // 检查缓存 - 使用更加鲁棒的 Key (前缀+长度+后缀) 以防不同图片的头部信息过于相似
    const cacheKey = `${base64.length}_${base64.slice(0, 100)}_${base64.slice(-100)}_${maxWidth}_${quality}`;
    if (this.imageCache.has(cacheKey)) {
      return this.imageCache.get(cacheKey)!;
    }

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        // 如果图片尺寸已经小于 maxWidth，直接返回原图
        if (img.width <= maxWidth) {
          this.imageCache.set(cacheKey, base64);
          resolve(base64);
          return;
        }

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
        const result = canvas.toDataURL('image/jpeg', quality);

        // 存入缓存（限制缓存大小）
        if (this.imageCache.size > 50) {
          const firstKey = this.imageCache.keys().next().value;
          this.imageCache.delete(firstKey);
        }
        this.imageCache.set(cacheKey, result);

        resolve(result);
      };
      img.onerror = () => resolve(base64); // 失败则返回原图
      img.src = base64;
    });
  }

  public async request(provider: ApiProvider, path: string, body: any, timeoutOverride?: number) {
    const timeoutMs = timeoutOverride || 120000;
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

  /**
   * 从提供商获取可用的模型列表
   */
  async fetchModels(provider: ApiProvider): Promise<string[]> {
    try {
      // 这里的路径通常是 /v1/models，但 provider.baseUrl 可能已经包含了 /v1
      let baseUrl = provider.baseUrl.replace(/\/$/, '');
      let url = '';

      if (baseUrl.endsWith('/v1')) {
        url = `${baseUrl}/models`;
      } else if (baseUrl.includes('/v1/')) {
        // 尝试提取到 /v1 级别
        const v1Idx = baseUrl.indexOf('/v1/');
        url = baseUrl.substring(0, v1Idx + 3) + '/models';
      } else {
        url = `${baseUrl}/models`;
      }

      console.log(`[ApiService] Fetching models from: ${url}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`无法获取模型列表: ${response.status}`);
      }

      const data = await response.json();

      // OpenAI 标准格式返回的是 { data: [{ id: "..." }, ...] }
      if (data && Array.isArray(data.data)) {
        return data.data.map((m: any) => m.id);
      }

      // 某些中转可能直接返回数组
      if (Array.isArray(data)) {
        return data.map((m: any) => typeof m === 'string' ? m : (m.id || m.name));
      }

      return [];
    } catch (error) {
      console.error("[ApiService] Error fetching models:", error);
      throw error;
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
      const modelName = config.model || '';
      const isGeminiNativeModel = false;
      const isGeminiChatImageModel = modelName.includes('gemini-3-pro-visual') || modelName.includes('gemini-3-pro-image-preview');
      const isGeminiImage = modelName.includes('nano-banana') || modelName.includes('gemini-') || modelName.includes('veo-') || modelName.includes('imagen');
      const isDoubaoSeedream = modelName.includes('doubao-seedream');

      // 1. Native Gemini Path (v1beta/generateContent)
      if (isGeminiNativeModel) {
        logger.info(`Using Native Gemini v1beta protocol: [${modelName}]`, 'ApiService');

        const nativeParts: any[] = [{ text: prompt }];
        if (base64Images) {
          const imageList = Array.isArray(base64Images) ? base64Images : [base64Images];
          for (const img of imageList) {
            const compressed = await this.compressImage(img, 1024, 0.7);
            const base64Data = compressed.includes(',') ? compressed.split(',')[1] : compressed;
            const mimeType = compressed.includes('png') ? 'image/png' : 'image/jpeg';
            nativeParts.push({ inlineData: { mimeType, data: base64Data } });
          }
        }

        const nativeBody = {
          contents: [{ parts: nativeParts }],
          generationConfig: { temperature: 0.4, topP: 1, topK: 32, maxOutputTokens: 2048 }
        };

        const adjustedProvider = { ...provider };
        if (adjustedProvider.baseUrl.endsWith('/v1')) {
          adjustedProvider.baseUrl = adjustedProvider.baseUrl.replace('/v1', '/v1beta');
        } else if (adjustedProvider.baseUrl.endsWith('/v1/')) {
          adjustedProvider.baseUrl = adjustedProvider.baseUrl.replace('/v1/', '/v1beta/');
        }

        const nativeData = await this.request(adjustedProvider, `/models/${modelName}:generateContent`, nativeBody, 600000);
        const responseParts = nativeData.candidates?.[0]?.content?.parts || [];

        for (const p of responseParts) {
          if (p.inlineData?.data) {
            return `data:${p.inlineData.mimeType || 'image/png'};base64,${p.inlineData.data}`;
          }
          if (p.text) {
            const t = p.text.trim();
            const markdownMatch = t.match(/!\[.*?\]\((.*?)\)/);
            if (markdownMatch && markdownMatch[1]) return markdownMatch[1];
            if (t.startsWith('data:image') || t.startsWith('http')) return t;
            if (t.length > 1000 && !t.includes(' ')) return `data:image/png;base64,${t}`;
          }
        }
        throw new Error("Native Gemini 接口解析画面失败");
      }

      // 2. Chat-based Path (Gemini Visuals)
      if (isGeminiChatImageModel) {
        logger.info(`Using Chat-based image generation: [${modelName}]`, 'ApiService');
        const chatResult = await this.chatPro(
          prompt,
          modelName,
          provider,
          Array.isArray(base64Images) ? base64Images : (base64Images ? [base64Images] : []),
          "You are a professional image generation engine. Analyze the user prompt and reference images to generate a high-quality, aesthetically pleasing visual result. Follow all technical and artistic instructions precisely.",
          undefined,
          labels
        );

        const markdownMatch = chatResult.match(/!\[.*?\]\((.*?)\)/);
        if (markdownMatch && markdownMatch[1]) return markdownMatch[1];
        if (chatResult.startsWith('data:image') || chatResult.startsWith('http')) return chatResult;
        if (chatResult.length > 1000 && !chatResult.includes(' ')) return `data:image/png;base64,${chatResult.trim()}`;
        if (chatResult.length < 500) throw new Error(`模型返回了非图像内容: ${chatResult}`);
        return chatResult;
      }

      // 3. Standard API Path (JSON)
      let enhancedPrompt = prompt;
      if (labels && labels.length > 0 && Array.isArray(base64Images)) {
        const labelDescriptions = labels
          .map((label, i) => i === 0 ? `【主体参考】: ${label || '产品主体'}` : `【参考元素】: ${label || '风格元素'}`)
          .join("\n");
        enhancedPrompt = `你是一个图像生成专家。保持主体形状一致，根据指令修改背景和细节。\n${labelDescriptions}\n\n【作图指令】\n${prompt}`;
      }

      const standardBody: any = {
        model: modelName || provider.imageModels?.[0] || "nano-banana-2",
        prompt: enhancedPrompt,
        n: 1,
        response_format: "url"
      };

      if (isDoubaoSeedream) {
        standardBody.image_size = this.mapRatioToSeedreamSize(config.ratio);
      } else if (isGeminiImage) {
        standardBody.aspect_ratio = config.ratio;
        if (modelName.includes('2k') || modelName.includes('4k')) {
          standardBody.image_size = modelName.includes('2k') ? '2K' : '4K';
        }
      } else {
        standardBody.size = this.mapRatioToSize(config.ratio);
      }

      if (base64Images) {
        const imageList = Array.isArray(base64Images) ? base64Images : [base64Images];
        if (imageList.length > 0) {
          standardBody.images = await Promise.all(imageList.map(async img => {
            const compressed = await this.compressImage(img, 1024, 0.7);
            return compressed.includes(',') ? compressed.split(',')[1] : compressed;
          }));
          standardBody.image = standardBody.images[0];
          standardBody.image_reference = standardBody.images[0];
        }
      }

      logger.info(`Sending Standard JSON request for model: ${standardBody.model}`, 'ApiService');
      const standardData = await this.request(provider, '/images/generations', standardBody, 600000);
      const imageItem = standardData.data?.[0];
      if (!imageItem) throw new Error("API 未返回图像数据");

      let result = imageItem.url || imageItem.b64_json;
      if (!result) throw new Error("API 未返回有效的图像数据");
      if (result.length > 100 && !result.startsWith('http') && !result.startsWith('data:')) {
        result = `data:image/png;base64,${result}`;
      }
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
    history?: { role: string, content: string, images?: string[], imageLabels?: string[] }[],
    imageLabels?: string[],
    setThinkingStatus?: (status: string) => void
  ) {
    if (!provider) throw new Error("未指定 API 提供商");

    const messages: any[] = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }

    // 1. Prepare all history images for compression in parallel to speed up preparation
    // Flatten all images into a single list with metadata so we can parallelize
    const historyImageTasks: Promise<string>[] = [];
    const historyImagesByMsg: string[][] = [];

    if (history && history.length > 0) {
      for (const msg of history) {
        if (msg.images && msg.images.length > 0) {
          const taskGroup = msg.images.map(img => this.compressImage(img, 1024, 0.7));
          historyImageTasks.push(...taskGroup);
        }
      }
    }

    // Prepare current images task
    const currentImageTasks = (base64Images || []).map(img => this.compressImage(img, 1024, 0.7));

    // Execute ALL compressions in parallel
    setThinkingStatus?.("🖼️ 正在压缩并同步视觉上下文...");
    const [allProcessedHistoryImages, processedCurrentImages] = await Promise.all([
      Promise.all(historyImageTasks),
      Promise.all(currentImageTasks)
    ]);

    // 2. Re-distribute the processed history images back to their messages
    let historyImgIdx = 0;
    if (history && history.length > 0) {
      for (const msg of history) {
        if (msg.images && msg.images.length > 0) {
          const count = msg.images.length;
          const msgImages = allProcessedHistoryImages.slice(historyImgIdx, historyImgIdx + count);
          historyImgIdx += count;

          // Prepend labels to content if available
          let labelContext = "";
          if (msg.imageLabels && msg.imageLabels.some(l => l)) {
            labelContext = "参考图标签：\n" + msg.imageLabels.map((l, i) => `- 图${i + 1}: ${l || '未标注'}`).join('\n') + "\n\n";
          }
          const content: any[] = [{ type: "text", text: labelContext + msg.content }];
          msgImages.forEach(img => {
            content.push({ type: "image_url", image_url: { url: img } });
          });
          messages.push({ role: msg.role, content });
        } else {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    // 3. Add current user message
    let currentLabelContext = "";
    if (imageLabels && imageLabels.some(l => l)) {
      currentLabelContext = "参考图标签：\n" + imageLabels.map((l, i) => `- 图${i + 1}: ${l || '未标注'}`).join('\n') + "\n\n";
    }
    const userContent: any[] = [{ type: "text", text: currentLabelContext + prompt }];
    if (processedCurrentImages.length > 0) {
      processedCurrentImages.forEach(img => {
        userContent.push({ type: "image_url", image_url: { url: img } });
      });
    }

    messages.push({ role: "user", content: userContent });

    // Determine timeout based on model
    // Complex designs and reflection loops need more time. default to 300s for flash/pro/thinking models.
    const lowerModel = (model || '').toLowerCase();
    const isThinkingModel = lowerModel.includes('thinking') ||
      lowerModel.includes('pro') ||
      lowerModel.includes('flash') ||
      lowerModel.includes('plus');
    const timeout = isThinkingModel ? 300000 : 120000;

    const data = await this.request(provider, '/chat/completions', {
      model: model || provider.models[0],
      messages: messages
    }, timeout);
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

    // Compress images to reduce payload size
    const processedImages = base64Images && base64Images.length > 0
      ? await Promise.all(base64Images.map(img => this.compressImage(img, 1024, 0.7)))
      : [];

    const userContent: any[] = [{ type: "text", text: enhancedPrompt }];
    if (processedImages.length > 0) {
      processedImages.forEach(img => {
        userContent.push({ type: "image_url", image_url: { url: img } });
      });
    }

    messages.push({ role: "user", content: userContent });

    // Extended timeout for prompt optimization, especially for thinking models
    const isThinkingModel = (model || '').includes('thinking') || (model || '').includes('pro');
    const timeout = isThinkingModel ? 300000 : 180000;

    const data = await this.request(provider, '/chat/completions', {
      model: model || provider.models[0],
      messages: messages
    }, timeout);
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
    formData.append('image', await this.imageToBlob(composedData.image, 'image/png'), 'image.png');
    formData.append('mask', await this.imageToBlob(composedData.mask, 'image/png'), 'mask.png');
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
    if (!b64) throw new Error("API 未返回有效的图像数据");
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
  async generateVideo(prompt: string, provider?: ApiProvider) { return Promise.reject(new Error("视频生成功能尚未实现，请检查 API 提供商配置")); }
  async generateTTS(text: string, voice: string, provider?: ApiProvider) { return Promise.reject(new Error("TTS 功能尚未实现，请检查 API 提供商配置")); }
  async editImage(base64Image: string, prompt: string, provider?: ApiProvider) { return Promise.reject(new Error("图像编辑功能尚未实现，请检查 API 提供商配置")); }
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

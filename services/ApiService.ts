
import { ApiProvider, ApiFormat } from "../types";

export class ApiService {
  private static instance: ApiService;

  private constructor() { }

  static getInstance() {
    if (!ApiService.instance) {
      ApiService.instance = new ApiService();
    }
    return ApiService.instance;
  }

  private async request(provider: ApiProvider, path: string, body: any, timeoutMs: number = 60000) {
    if (!provider || !provider.apiKey || !provider.baseUrl) {
      throw new Error("API 提供商未配置或信息不完整");
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const url = `${provider.baseUrl.replace(/\/$/, '')}${path}`;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${provider.apiKey}`
      };

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
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

  async generateImage(prompt: string, config: { ratio: string, model?: string }, provider?: ApiProvider, base64Image?: string) {
    if (!provider) throw new Error("未指定 API 提供商");

    if (provider.format === 'openai') {
      const isNanoBanana = (config.model || '').includes('nano-banana');

      const body: any = {
        model: config.model || provider.imageModels?.[0] || "nano-banana-2",
        prompt: prompt,
        n: 1,
        response_format: "b64_json"
      };

      // Nano Banana (Gemini-based) uses aspect_ratio, standard OpenAI uses size
      if (isNanoBanana) {
        body.aspect_ratio = config.ratio;
      } else {
        body.size = this.mapRatioToSize(config.ratio);
      }

      if (base64Image) {
        body.image = base64Image;
      }

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
      '16:9': '1792x1024'
    };
    return map[ratio] || '1024x1024';
  }

  private mapRatioToWidth(ratio: string): number {
    const map: Record<string, number> = { '1:1': 1024, '3:4': 768, '4:3': 1024, '9:16': 1024, '16:9': 1536 };
    return map[ratio] || 1024;
  }

  private mapRatioToHeight(ratio: string): number {
    const map: Record<string, number> = { '1:1': 1024, '3:4': 1024, '4:3': 768, '9:16': 1792, '16:9': 864 };
    return map[ratio] || 1024;
  }

  async chatPro(prompt: string, model: string, provider?: ApiProvider) {
    if (!provider) throw new Error("未指定 API 提供商");

    const data = await this.request(provider, '/chat/completions', {
      model: model || provider.models[0],
      messages: [{ role: "user", content: prompt }]
    });
    return data.choices[0].message.content;
  }

  async optimizePrompt(prompt: string, model: string, provider?: ApiProvider, base64Images?: string[], systemPrompt?: string) {
    if (!provider) throw new Error("未指定 API 提供商");

    const messages: any[] = [];

    // 如果提供了自定义提示词工程模板，作为 system 角色
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    } else {
      messages.push({ role: "system", content: "You are a prompt engineering expert. Your task is to refine and expand the user's input into a detailed, high-quality prompt suitable for AI image generation. Focus on lighting, composition, style, and technical details." });
    }

    const userContent: any[] = [{ type: "text", text: prompt }];
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

  // 临时保留占位，后续可根据需要实现
  async generateVideo(prompt: string, provider?: ApiProvider) { throw new Error("当前提供商不支持视频生成"); }
  async generateTTS(text: string, voice: string, provider?: ApiProvider) { throw new Error("当前提供商不支持 TTS"); }
  async editImage(base64Image: string, prompt: string, provider?: ApiProvider) { throw new Error("当前提供商不支持图像编辑"); }
  async searchGrounding(prompt: string, provider?: ApiProvider) { throw new Error("当前提供商不支持搜索增强"); }
  async analyzeImage(base64Images: string[], prompt: string, provider?: ApiProvider, model?: string) {
    return this.optimizePrompt(prompt || "Analyze these images in detail.", model || '', provider, base64Images, "You are a visual analysis expert. Describe the provided images accurately and thoroughly.");
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

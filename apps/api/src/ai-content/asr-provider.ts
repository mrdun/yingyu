/**
 * ASR（语音转写）provider 抽象。
 * 默认提供 OpenAI Whisper 参考实现；国内部署可注入阿里云/腾讯云/智谱等实现。
 */

export const ASR_PROVIDER = Symbol("ASR_PROVIDER");

export interface AsrProvider {
  /**
   * 把音频 Buffer 转写为文本。
   */
  transcribe(audio: Buffer, options?: { language?: string; mimeType?: string }): Promise<string>;
}

export class WhisperAsrProvider implements AsrProvider {
  private readonly apiUrl = "https://api.openai.com/v1/audio/transcriptions";
  private readonly apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  async transcribe(
    audio: Buffer,
    options?: { language?: string; mimeType?: string },
  ): Promise<string> {
    const key = this.apiKey ?? process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error("OPENAI_API_KEY 未配置，无法进行语音转写");
    }

    const form = new FormData();
    form.append(
      "file",
      new Blob([audio], { type: options?.mimeType ?? "audio/mpeg" }),
      "audio.mp3",
    );
    form.append("model", "whisper-1");
    if (options?.language) form.append("language", options.language);

    const res = await fetch(this.apiUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Whisper 转写失败: ${res.status} ${body}`);
    }

    const data = (await res.json()) as { text?: string };
    return data.text ?? "";
  }
}

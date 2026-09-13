/**
 * 音频文件 → base64 (AI 音频建课的传输格式)。
 *
 * 与既有编辑器一致: 读 dataURL 后**去掉** "data:*;base64," 前缀, 只提交纯 base64,
 * 并单独提交 mimeType —— 后端 Buffer.from(audioBase64, "base64") 按纯 base64 解码。
 *
 * 为什么要有大小提示: base64 会让体积膨胀约 1/3, 大文件在浏览器/网关侧都容易卡住或直接
 * 被拒。这里给出明确提示而不是静默失败 (超过上限时直接报错, 由用户换更小的文件)。
 */

export const AUDIO_WARN_BYTES = 5 * 1024 * 1024;
export const AUDIO_MAX_BYTES = 20 * 1024 * 1024;

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "未知大小";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** dataURL → 纯 base64 (兼容传入没有前缀的纯 base64) */
export function stripDataUrlPrefix(value: string): string {
  const source = String(value ?? "");
  if (!source.startsWith("data:")) return source;
  const commaIndex = source.indexOf(",");
  return commaIndex === -1 ? "" : source.slice(commaIndex + 1);
}

/** 读取文件为 dataURL (FileReader 在浏览器环境可用) */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("读取文件失败, 请重新选择文件"));
    reader.readAsDataURL(file);
  });
}

export interface AudioPayload {
  audioBase64: string;
  mimeType: string;
  size: number;
}

/**
 * 音频文件 → { audioBase64, mimeType }。
 * 超过 AUDIO_MAX_BYTES 直接抛错 (提示原文会展示给管理员), 不做静默截断。
 */
export async function toAudioPayload(file: File): Promise<AudioPayload> {
  if (file.size > AUDIO_MAX_BYTES) {
    throw new Error(
      `音频文件 ${formatBytes(file.size)} 超过上限 ${formatBytes(AUDIO_MAX_BYTES)}, ` +
        `请先压缩或剪短后再提交 (base64 传输体积还会再增大约 1/3)。`,
    );
  }

  const dataUrl = await readFileAsDataUrl(file);
  const audioBase64 = stripDataUrlPrefix(dataUrl);
  if (!audioBase64) throw new Error("音频读取失败: 文件内容为空");

  return {
    audioBase64,
    mimeType: file.type || "audio/mpeg",
    size: file.size,
  };
}

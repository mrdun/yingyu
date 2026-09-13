import type { AdminStatementWritePayload, StatementSourceTypeValue } from "~/types/admin";

/**
 * 语句表单的取值、校验与请求体组装。
 *
 * 校验**只在表单层** (后端 DTO 只做 @IsInt/@Min(0) 这类基础校验, 本批次不给后端加业务规则):
 *  - chinese / english 必填;
 *  - sourceType 只能是 text / audio / video;
 *  - sourceType === "audio" 时才要求音频与时间轴: audioUrl 必填, startMs 必填;
 *  - startMs / endMs 为非负整数; endMs 若填必须 > startMs;
 *  - 非 audio 类型下不强制音频/时间轴, 但一旦填了同样按上面的规则校验 (不留半截数据)。
 */

export const STATEMENT_SOURCE_TYPES: Array<{ value: StatementSourceTypeValue; label: string }> = [
  { value: "text", label: "文本 (text)" },
  { value: "audio", label: "音频 (audio)" },
  { value: "video", label: "视频 (video)" },
];

export interface StatementFormValues {
  chinese: string;
  english: string;
  soundmark: string;
  sourceType: string;
  audioUrl: string;
  startMs: string;
  endMs: string;
  order: string;
}

export type StatementFormErrors = Partial<Record<keyof StatementFormValues, string>>;

export interface StatementFormValidation {
  errors: StatementFormErrors;
  /** 校验通过时的请求体 (可直接交给 POST/PATCH); 校验失败为 null */
  payload: AdminStatementWritePayload | null;
}

export function emptyStatementForm(): StatementFormValues {
  return {
    chinese: "",
    english: "",
    soundmark: "",
    sourceType: "text",
    audioUrl: "",
    startMs: "",
    endMs: "",
    order: "",
  };
}

function parseNonNegativeInteger(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
}

export function validateStatementForm(values: StatementFormValues): StatementFormValidation {
  const errors: StatementFormErrors = {};
  const isAudio = values.sourceType === "audio";

  const chinese = values.chinese.trim();
  const english = values.english.trim();
  if (!chinese) errors.chinese = "中文必填";
  if (!english) errors.english = "英文必填";

  if (!STATEMENT_SOURCE_TYPES.some((item) => item.value === values.sourceType)) {
    errors.sourceType = "素材类型只能是 text / audio / video";
  }

  const audioUrl = values.audioUrl.trim();
  if (isAudio && !audioUrl) {
    errors.audioUrl = "音频类型必须填写音频地址 (audioUrl)";
  }

  const startRaw = values.startMs.trim();
  const endRaw = values.endMs.trim();
  let startMs: number | undefined;
  let endMs: number | undefined;

  if (isAudio && !startRaw) {
    errors.startMs = "音频类型必须填写起始时间 (startMs, 毫秒)";
  }

  if (startRaw) {
    const parsed = parseNonNegativeInteger(startRaw);
    if (parsed === null) {
      errors.startMs = "startMs 必须是非负整数 (毫秒)";
    } else {
      startMs = parsed;
    }
  }

  if (endRaw) {
    const parsed = parseNonNegativeInteger(endRaw);
    if (parsed === null) {
      errors.endMs = "endMs 必须是非负整数 (毫秒)";
    } else {
      endMs = parsed;
    }
  }

  if (startMs !== undefined && endMs !== undefined && endMs <= startMs) {
    errors.endMs = "endMs 必须大于 startMs";
  }

  let order: number | undefined;
  if (values.order.trim()) {
    const parsed = parseNonNegativeInteger(values.order);
    if (parsed === null) {
      errors.order = "order 必须是非负整数";
    } else {
      order = parsed;
    }
  }

  if (Object.keys(errors).length > 0) return { errors, payload: null };

  const payload: AdminStatementWritePayload = {
    chinese,
    english,
    soundmark: values.soundmark.trim(),
    sourceType: values.sourceType,
  };

  // 仅在有值时发送音频/时间轴字段 (PATCH 语义: 未发送 = 不改)
  if (audioUrl) payload.audioUrl = audioUrl;
  if (startMs !== undefined) payload.startMs = startMs;
  if (endMs !== undefined) payload.endMs = endMs;
  if (order !== undefined) payload.order = order;

  return { errors, payload };
}

/** 接口返回的语句 → 表单初值 */
export function statementRowToForm(row: {
  chinese: string;
  english: string;
  soundmark: string;
  sourceType: string;
  audioUrl: string | null;
  startMs: number | null;
  endMs: number | null;
  order: number;
}): StatementFormValues {
  return {
    chinese: row.chinese,
    english: row.english,
    soundmark: row.soundmark,
    sourceType: row.sourceType || "text",
    audioUrl: row.audioUrl ?? "",
    startMs: row.startMs === null ? "" : String(row.startMs),
    endMs: row.endMs === null ? "" : String(row.endMs),
    order: String(row.order),
  };
}

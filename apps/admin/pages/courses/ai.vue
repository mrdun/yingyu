<script setup lang="ts">
import type { AiSplitStatement } from "~/types/admin";
import type { TableColumn } from "~/types/ui";

import { navigateTo } from "nuxt/app";
import { computed, ref } from "vue";

import DataTable from "~/components/table/DataTable.vue";
import AppInput from "~/components/form/AppInput.vue";
import AppButton from "~/components/ui/AppButton.vue";
import AppEmpty from "~/components/ui/AppEmpty.vue";
import AppError from "~/components/ui/AppError.vue";
import AppLoading from "~/components/ui/AppLoading.vue";
import { useAdminToast } from "~/composables/useAdminToast";
import { useAsyncResource } from "~/composables/useAsyncResource";
import { useRelogin } from "~/composables/useRelogin";
import { getErrorMessage } from "~/services/admin-api";
import {
  createAiCoursePackFromAudio,
  createAiCoursePackFromSubtitle,
  createAiCoursePackFromText,
  splitStatements,
} from "~/services/aiContent.service";
import { AUDIO_WARN_BYTES, formatBytes, toAudioPayload } from "~/utils/audio";

/**
 * 课程中心 —— AI 生成入口 (/courses/ai)。
 *
 * 四个入口 (字段严格按后端 DTO, 不额外发明参数):
 *  - 文本拆句      POST /ai-content/split    只预览, **不落库**
 *  - 文本建课包    POST /ai-content/course-pack
 *  - 字幕建课包    POST /ai-content/subtitle
 *  - 音频建课包    POST /ai-content/audio    (base64)
 *
 * 硬约束 (本页不得违反):
 *  1. AI 建课在后端事务内固定写入 status="draft" + source="ai", 本页不改这个行为;
 *  2. 本页**没有**任何"直接发布"按钮或绕过审核的快捷路径 —— 生成后只能跳转到草稿详情页,
 *     由「提交审核 → 发布」的既有状态机接管;
 *  3. 大文件不静默失败: 超过上限直接提示, 超过警告阈值给出体积提示。
 */

const SPLIT_COLUMNS: TableColumn[] = [
  { key: "order", label: "序号", align: "right" },
  { key: "english", label: "英文" },
  { key: "chinese", label: "中文" },
  { key: "soundmark", label: "音标" },
];

/** 页面顶部的固定说明 (常驻, 不可关闭) */
const AI_DRAFT_NOTICE =
  "AI 生成的内容一律为草稿且来源标记为 AI, 必须经过审核 → 发布流程, 不能直接对外可见。";

const AI_MODES = [
  { key: "split", label: "文本拆句 (仅预览)" },
  { key: "text", label: "文本建课包" },
  { key: "subtitle", label: "字幕建课包" },
  { key: "audio", label: "音频建课包" },
] as const;

type AiMode = (typeof AI_MODES)[number]["key"];

const mode = ref<AiMode>("split");
const title = ref("");
const description = ref("");
const text = ref("");
const subtitle = ref("");
const courseSize = ref("");
const audioBase64 = ref("");
const audioMimeType = ref("");
const audioFileName = ref("");
const audioSize = ref(0);
const audioWarning = ref("");

const formError = ref<string | null>(null);
const submitting = ref(false);

const toast = useAdminToast();
const relogin = useRelogin();

const splitResource = useAsyncResource<AiSplitStatement[]>(
  async () => {
    const result = await splitStatements({ title: title.value.trim(), text: text.value.trim() });
    return Array.isArray(result) ? result : [];
  },
  { isEmpty: (rows) => rows.length === 0, immediate: false },
);

const activeModeLabel = computed(
  () => AI_MODES.find((item) => item.key === mode.value)?.label ?? "",
);

/** 拆句预览结果 (null 表示还没请求过) */
const splitPreview = computed<AiSplitStatement[]>(() => splitResource.data.value ?? []);

/** courseSize 选填正整数 (后端 DTO: @IsInt @Min(1)) */
function parseCourseSize(): { value: number | undefined; error: string | null } {
  const raw = courseSize.value.trim();
  if (!raw) return { value: undefined, error: null };
  if (!/^\d+$/.test(raw)) return { value: undefined, error: "每课句数必须是正整数" };
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    return { value: undefined, error: "每课句数必须是正整数" };
  }
  return { value, error: null };
}

function switchMode(next: AiMode): void {
  mode.value = next;
  formError.value = null;
}

async function submitSplit(): Promise<void> {
  formError.value = null;
  if (!title.value.trim()) {
    formError.value = "标题必填";
    return;
  }
  if (!text.value.trim()) {
    formError.value = "英文文本必填";
    return;
  }
  await splitResource.refresh();
  if (splitResource.errorMessage.value) formError.value = splitResource.errorMessage.value;
}

async function onAudioChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;

  formError.value = null;
  audioWarning.value = "";

  try {
    const payload = await toAudioPayload(file);
    audioBase64.value = payload.audioBase64;
    audioMimeType.value = payload.mimeType;
    audioFileName.value = file.name;
    audioSize.value = payload.size;

    if (payload.size > AUDIO_WARN_BYTES) {
      audioWarning.value =
        `文件较大 (${formatBytes(payload.size)}), base64 提交后体积约 ` +
        `${formatBytes(Math.ceil(payload.size * 1.37))}, 转写可能很慢或被网关拒绝; ` +
        `建议先压缩 / 剪短。`;
    }
  } catch (error) {
    audioBase64.value = "";
    audioMimeType.value = "";
    audioFileName.value = "";
    audioSize.value = 0;
    formError.value = getErrorMessage(error);
  }
}

function validateCommon(): { error: string | null; courseSize?: number } {
  if (!title.value.trim()) return { error: "标题必填" };
  const size = parseCourseSize();
  if (size.error) return { error: size.error };
  return { error: null, ...(size.value === undefined ? {} : { courseSize: size.value }) };
}

async function submitCoursePack(kind: "text" | "subtitle" | "audio"): Promise<void> {
  if (submitting.value) return;
  formError.value = null;

  const common = validateCommon();
  if (common.error) {
    formError.value = common.error;
    return;
  }

  if (kind === "text" && !text.value.trim()) {
    formError.value = "英文文本必填";
    return;
  }
  if (kind === "subtitle" && !subtitle.value.trim()) {
    formError.value = "字幕内容必填";
    return;
  }
  if (kind === "audio" && !audioBase64.value) {
    formError.value = "请先选择音频文件";
    return;
  }

  const base = {
    title: title.value.trim(),
    description: description.value.trim(),
    ...(common.courseSize === undefined ? {} : { courseSize: common.courseSize }),
  };

  submitting.value = true;
  try {
    const result =
      kind === "audio"
        ? await createAiCoursePackFromAudio({
            ...base,
            audioBase64: audioBase64.value,
            mimeType: audioMimeType.value,
          })
        : kind === "subtitle"
          ? await createAiCoursePackFromSubtitle({ ...base, subtitle: subtitle.value })
          : await createAiCoursePackFromText({ ...base, text: text.value });

    toast.success(
      "已生成草稿课程包 (AI)",
      "该课程包为草稿且来源标记为 AI, 需提交审核并通过后才能发布。",
    );

    // 只跳到草稿详情页 —— 审核/发布必须走课程包详情页的既有状态机
    if (result?.coursePackId) await navigateTo(`/courses/${result.coursePackId}`);
  } catch (error) {
    const message = getErrorMessage(error);
    formError.value = message;
    toast.error("AI 生成失败", message);
  } finally {
    submitting.value = false;
  }
}

/** 模板里的"生成"按钮: split 模式不会走到这里 (它用 submitSplit) */
async function submitActiveMode(): Promise<void> {
  if (mode.value === "split") return;
  await submitCoursePack(mode.value);
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div
      class="alert alert-warning text-xs"
      data-testid="ai-draft-notice"
    >
      <div class="flex flex-col gap-1">
        <p class="font-medium">{{ AI_DRAFT_NOTICE }}</p>
        <p>
          生成成功后只会跳转到该草稿课程包的详情页, 由「提交审核 → 发布」流程接管;
          本页不提供任何直接发布的入口。
        </p>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <AppButton
        v-for="item in AI_MODES"
        :key="item.key"
        size="sm"
        :variant="mode === item.key ? 'primary' : 'ghost'"
        @click="switchMode(item.key)"
      >
        {{ item.label }}
      </AppButton>
      <span class="text-xs text-base-content/50">当前: {{ activeModeLabel }}</span>
    </div>

    <div class="flex flex-col gap-3 rounded-box border border-base-300 bg-base-100 p-4">
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <AppInput
          v-model="title"
          label="标题 (title)"
          required
          placeholder="例如 日常英语口语 100 句"
        />
        <AppInput
          v-model="description"
          label="描述 (description)"
          placeholder="课程包简介 (可选)"
        />
      </div>

      <div
        v-if="mode !== 'split'"
        class="w-56"
      >
        <AppInput
          v-model="courseSize"
          label="每课句数 (courseSize)"
          hint="选填正整数; 留空用后端默认值"
          placeholder="例如 10"
        />
      </div>

      <label
        v-if="mode === 'split' || mode === 'text'"
        class="form-control w-full"
      >
        <span class="label pb-1 text-xs font-medium text-base-content/70">
          英文文本 (text) <span class="text-error">*</span>
        </span>
        <textarea
          v-model="text"
          rows="10"
          class="textarea textarea-bordered w-full text-sm leading-relaxed"
          placeholder="粘贴英文素材, 每句一行或多行均可, AI 会自动拆句"
        ></textarea>
      </label>

      <label
        v-else-if="mode === 'subtitle'"
        class="form-control w-full"
      >
        <span class="label pb-1 text-xs font-medium text-base-content/70">
          字幕全文 (subtitle) <span class="text-error">*</span>
        </span>
        <textarea
          v-model="subtitle"
          rows="10"
          class="textarea textarea-bordered w-full font-mono text-sm leading-relaxed"
          placeholder="粘贴 .srt / .vtt 字幕全文, 后端会自动去掉时间戳再拆句"
        ></textarea>
      </label>

      <div
        v-else
        class="flex flex-col gap-2"
      >
        <span class="text-xs font-medium text-base-content/70">
          音频文件 (audioBase64 + mimeType) <span class="text-error">*</span>
        </span>
        <input
          type="file"
          accept="audio/*,.mp3,.m4a,.wav,.webm,.ogg"
          class="file-input file-input-bordered file-input-sm w-full max-w-md"
          @change="onAudioChange"
        />
        <p
          v-if="audioFileName"
          class="text-xs text-base-content/70"
        >
          已选择 {{ audioFileName }} ({{ formatBytes(audioSize) }}, {{ audioMimeType }}) ——
          提交后由后端转写为文本再建课, 可能需要一到数分钟。
        </p>
        <p
          v-else
          class="text-xs text-base-content/50"
        >
          选择音频后自动转 base64 提交 (与既有编辑器一致, 只提交纯 base64)。 超过
          {{ formatBytes(AUDIO_WARN_BYTES) }} 会给出提示, 无法读取或过大的文件会直接报错,
          不会静默失败。
        </p>
        <p
          v-if="audioWarning"
          class="text-xs text-warning"
        >
          {{ audioWarning }}
        </p>
      </div>

      <p
        v-if="formError"
        class="text-xs text-error"
        role="alert"
      >
        {{ formError }}
      </p>

      <div class="flex items-center gap-2">
        <AppButton
          v-if="mode === 'split'"
          size="sm"
          :loading="splitResource.pending.value"
          @click="submitSplit"
        >
          预览拆句 (不落库)
        </AppButton>
        <AppButton
          v-else
          size="sm"
          :loading="submitting"
          @click="submitActiveMode"
        >
          生成草稿课程包
        </AppButton>
        <span class="text-xs text-base-content/50">
          {{
            mode === "split"
              ? "拆句只返回预览结果, 不会写入数据库"
              : "生成结果固定为草稿 (draft) + 来源 AI, 需审核后发布"
          }}
        </span>
      </div>
    </div>

    <div
      v-if="mode === 'split'"
      class="overflow-hidden rounded-box border border-base-300 bg-base-100"
    >
      <div class="border-b border-base-300 px-4 py-3">
        <p class="text-sm font-medium">拆句预览</p>
        <p class="text-xs text-base-content/60">
          数据来源: POST /ai-content/split (只预览, 不落库)
        </p>
      </div>

      <AppLoading
        v-if="splitResource.pending.value"
        label="正在拆句"
      />
      <AppError
        v-else-if="splitResource.errorMessage.value"
        title="拆句失败"
        :message="splitResource.errorMessage.value"
        :status-code="splitResource.statusCode.value"
        :show-sign-in="splitResource.unauthenticated.value"
        @retry="submitSplit"
        @sign-in="relogin"
      />
      <AppEmpty
        v-else-if="!splitResource.data.value"
        title="还没有预览结果"
        description="填写标题与英文文本后点击「预览拆句」, 结果不会写入数据库。"
      />
      <AppEmpty
        v-else-if="splitPreview.length === 0"
        title="没有拆出任何句子"
        description="AI 返回了空结果, 请检查素材内容后重试。"
      />
      <DataTable
        v-else
        :columns="SPLIT_COLUMNS"
      >
        <tr
          v-for="(item, index) in splitPreview"
          :key="`${index}-${item.order}`"
          class="hover"
        >
          <td class="text-right text-xs tabular-nums">{{ item.order }}</td>
          <td class="text-sm">{{ item.english }}</td>
          <td class="text-sm">{{ item.chinese }}</td>
          <td class="text-xs text-base-content/70">{{ item.soundmark || "—" }}</td>
        </tr>
      </DataTable>
    </div>
  </div>
</template>

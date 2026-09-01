<template>
  <div class="mx-auto flex w-full max-w-3xl flex-col px-4 py-6">
    <h2 class="mb-2 text-center text-3xl">课程包编辑器</h2>
    <div class="alert mb-4 bg-base-200 text-sm">
      <span>仅管理员使用：粘贴英文素材，一键生成课程包。</span>
    </div>

    <div
      v-if="errorMessage"
      role="alert"
      class="alert alert-error mb-4"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-6 w-6 shrink-0 stroke-current"
        fill="none"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <span>{{ errorMessage }}</span>
    </div>

    <form
      class="flex flex-col gap-4"
      @submit.prevent="handleSubmit"
    >
      <div class="form-control">
        <label
          class="label"
          for="editor-title"
          ><span class="label-text">标题（必填）</span></label
        >
        <input
          id="editor-title"
          v-model="form.title"
          type="text"
          placeholder="例如：日常英语口语 100 句"
          class="input input-bordered w-full"
        />
      </div>

      <div class="form-control">
        <label
          class="label"
          for="editor-description"
          ><span class="label-text">描述</span></label
        >
        <input
          id="editor-description"
          v-model="form.description"
          type="text"
          placeholder="课程包简介（可选）"
          class="input input-bordered w-full"
        />
      </div>

      <div class="form-control">
        <div class="join mb-2 w-full">
          <button
            type="button"
            class="btn join-item flex-1"
            :class="inputMode === 'text' ? 'btn-primary' : 'btn-ghost'"
            @click="inputMode = 'text'"
          >
            文本素材
          </button>
          <button
            type="button"
            class="btn join-item flex-1"
            :class="inputMode === 'subtitle' ? 'btn-primary' : 'btn-ghost'"
            @click="inputMode = 'subtitle'"
          >
            字幕文件 (.srt / .vtt)
          </button>
          <button
            type="button"
            class="btn join-item flex-1"
            :class="inputMode === 'audio' ? 'btn-primary' : 'btn-ghost'"
            @click="inputMode = 'audio'"
          >
            音频 (MP3)
          </button>
        </div>

        <div
          v-if="inputMode !== 'audio'"
          class="flex items-center gap-2"
        >
          <input
            type="file"
            accept=".srt,.vtt,.txt"
            class="file-input file-input-bordered file-input-sm w-full max-w-xs"
            @change="handleFileUpload"
          />
          <span class="text-xs text-gray-400">或上传 .srt/.vtt/.txt 文件自动填充</span>
        </div>

        <template v-if="inputMode === 'text'">
          <label
            class="label"
            for="editor-text"
          >
            <span class="label-text">课程正文（必填，至少 50 字符）</span>
            <span class="label-text-alt">当前 {{ form.text.trim().length }} 字符</span>
          </label>
          <textarea
            id="editor-text"
            v-model="form.text"
            rows="12"
            placeholder="粘贴英文素材，每句一行或多行均可，AI 会自动拆句"
            class="textarea textarea-bordered w-full leading-relaxed"
          ></textarea>
        </template>

        <template v-else-if="inputMode === 'subtitle'">
          <label
            class="label"
            for="editor-subtitle"
          >
            <span class="label-text">字幕内容（必填，粘贴 .srt/.vtt 全文）</span>
            <span class="label-text-alt">当前 {{ form.subtitle.trim().length }} 字符</span>
          </label>
          <textarea
            id="editor-subtitle"
            v-model="form.subtitle"
            rows="12"
            placeholder="粘贴 .srt 或 .vtt 字幕全文，系统会自动去除时间戳并 AI 拆句"
            class="textarea textarea-bordered w-full font-mono text-sm leading-relaxed"
          ></textarea>
        </template>

        <template v-else>
          <label class="label">
            <span class="label-text">音频文件（必填，MP3/WAV/M4A 等）</span>
          </label>
          <input
            type="file"
            accept="audio/*,.mp3,.m4a,.wav,.webm,.ogg"
            class="file-input file-input-bordered w-full"
            @change="handleAudioUpload"
          />
          <p
            v-if="audioSelected"
            class="mt-2 text-sm text-green-600"
          >
            已选择音频，提交后将 Whisper 转写 → AI 拆句 → 生成课程包（较大音频可能需要一到数分钟）。
          </p>
          <p
            v-else
            class="mt-2 text-xs text-gray-400"
          >
            选择音频文件后自动转 base64 提交；需在 .env 配置 OPENAI_API_KEY。
          </p>
        </template>
      </div>

      <div class="form-control w-48">
        <label
          class="label"
          for="editor-course-size"
          ><span class="label-text">每课句数（1-50）</span></label
        >
        <input
          id="editor-course-size"
          v-model.number="form.courseSize"
          type="number"
          min="1"
          max="50"
          class="input input-bordered w-full"
        />
      </div>

      <button
        type="submit"
        class="btn btn-primary"
        :disabled="isLoading"
      >
        <span
          v-if="isLoading"
          class="loading loading-spinner loading-sm"
        ></span>
        {{ isLoading ? progressText : "生成课程包" }}
      </button>
    </form>

    <div
      v-if="result"
      class="mt-6"
    >
      <div class="alert alert-success">
        <span>
          生成成功！课程包 ID：{{ result.coursePackId }}，共 {{ result.courseCount }} 课。
        </span>
      </div>
      <NuxtLink
        :to="`/course-pack/${result.coursePackId}`"
        class="btn btn-secondary mt-4"
      >
        前往课程包
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from "vue";

import type { CoursePackResponse } from "~/api/ai-content";
import {
  createCoursePack,
  createCoursePackFromAudio,
  createCoursePackFromSubtitle,
} from "~/api/ai-content";

const form = reactive({
  title: "",
  description: "",
  text: "",
  subtitle: "",
  audioBase64: "",
  audioMimeType: "",
  courseSize: 10,
});

const inputMode = ref<"text" | "subtitle" | "audio">("text");
const audioSelected = ref(false);
const isLoading = ref(false);
const progressText = ref("正在提交…");
const errorMessage = ref("");
const result = ref<CoursePackResponse | null>(null);

function handleFileUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const content = String(reader.result ?? "");
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "srt" || ext === "vtt") {
      inputMode.value = "subtitle";
      form.subtitle = content;
    } else {
      inputMode.value = "text";
      form.text = content;
    }
  };
  reader.readAsText(file);
  input.value = ""; // 允许重复选择同一文件
}

function handleAudioUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    // data:audio/mpeg;base64,XXXX → 拆出 base64 与 mimeType
    const dataUrl = String(reader.result ?? "");
    const commaIndex = dataUrl.indexOf(",");
    if (commaIndex === -1) {
      errorMessage.value = "读取音频失败";
      return;
    }
    form.audioMimeType = file.type || "audio/mpeg";
    form.audioBase64 = dataUrl.slice(commaIndex + 1);
    audioSelected.value = true;
  };
  reader.readAsDataURL(file);
  input.value = ""; // 允许重复选择同一文件
}

function validate(): string {
  if (!form.title.trim()) {
    return "请填写标题";
  }
  if (inputMode.value === "audio") {
    if (!form.audioBase64) {
      return "请选择音频文件";
    }
  } else if (inputMode.value === "subtitle") {
    if (form.subtitle.trim().length < 20) {
      return "字幕内容至少需要 20 个字符";
    }
  } else if (form.text.trim().length < 50) {
    return "课程正文至少需要 50 个字符";
  }
  if (!Number.isInteger(form.courseSize) || form.courseSize < 1 || form.courseSize > 50) {
    return "每课句数需为 1-50 之间的整数";
  }
  return "";
}

async function handleSubmit() {
  errorMessage.value = "";
  result.value = null;

  const validationMessage = validate();
  if (validationMessage) {
    errorMessage.value = validationMessage;
    return;
  }

  isLoading.value = true;
  progressText.value =
    inputMode.value === "audio"
      ? "正在语音转写与AI拆句，可能需要一到数分钟…"
      : "正在AI拆句，可能需要一到两分钟…";
  try {
    // 长文本分阶段提示
    setTimeout(() => {
      if (isLoading.value) {
        progressText.value = "正在生成课程与语句，请稍候…";
      }
    }, 8000);

    const common = {
      title: form.title.trim(),
      description: form.description.trim(),
      courseSize: form.courseSize,
    };

    let response: CoursePackResponse;
    if (inputMode.value === "audio") {
      response = await createCoursePackFromAudio({
        ...common,
        audioBase64: form.audioBase64,
        mimeType: form.audioMimeType,
      });
    } else if (inputMode.value === "subtitle") {
      response = await createCoursePackFromSubtitle({ ...common, subtitle: form.subtitle });
    } else {
      response = await createCoursePack({ ...common, text: form.text });
    }

    result.value = response;
  } catch (error: any) {
    const message = error?.data?.message || error?.message || "生成失败，请稍后重试";
    errorMessage.value = typeof message === "string" ? message : JSON.stringify(message);
  } finally {
    isLoading.value = false;
  }
}
</script>

<style></style>

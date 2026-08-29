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
import { createCoursePack } from "~/api/ai-content";

const form = reactive({
  title: "",
  description: "",
  text: "",
  courseSize: 10,
});

const isLoading = ref(false);
const progressText = ref("正在提交…");
const errorMessage = ref("");
const result = ref<CoursePackResponse | null>(null);

function validate(): string {
  if (!form.title.trim()) {
    return "请填写标题";
  }
  if (form.text.trim().length < 50) {
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
  progressText.value = "正在AI拆句，可能需要一到两分钟…";
  try {
    // 长文本分阶段提示
    setTimeout(() => {
      if (isLoading.value) {
        progressText.value = "正在生成课程与语句，请稍候…";
      }
    }, 8000);

    const response = await createCoursePack({
      title: form.title.trim(),
      description: form.description.trim(),
      text: form.text,
      courseSize: form.courseSize,
    });
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

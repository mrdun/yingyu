<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";

import type {
  AdminPlanPayload,
  AdminPlanRow,
  AdminPlansHealth,
  BusinessSettingRow,
} from "~/api/admin";
import {
  createAdminPlan,
  deleteAdminPlan,
  fetchAdminPlans,
  fetchAdminPlansHealth,
  fetchBusinessSettings,
  updateAdminPlan,
  updateBusinessSetting,
} from "~/api/admin";
import { signIn } from "~/services/auth";

const loading = ref(true);
const needLogin = ref(false);
const noPermission = ref(false);
const errorMessage = ref("");
const actionMessage = ref("");
const busy = ref("");

const plans = ref<AdminPlanRow[]>([]);
const settings = ref<BusinessSettingRow[]>([]);
const health = ref<AdminPlansHealth | null>(null);

const form = reactive({
  id: "",
  name: "",
  priceYuan: "",
  durationDays: "",
  sortOrder: "0",
  isActive: true,
  isPublic: true,
});

const SETTING_LABELS: Record<string, string> = {
  refund_window_hours: "退款保护期 (小时)",
  commission_settlement_days: "佣金结算周期 (天)",
  partner_enabled: "Partner 计划开关 (true/false)",
  lifetime_partner_required: "仅终身会员可申请 Partner (true/false)",
  currency: "结算币种 (ISO 4217)",
};

function yuan(fen: number) {
  return `¥${(fen / 100).toFixed(2)}`;
}

function durationText(days: number | null) {
  return days === null ? "永久" : `${days} 天`;
}

function isSettingError(e: any) {
  const status = e?.status ?? e?.statusCode;
  if (status === 401) needLogin.value = true;
  else if (status === 403) noPermission.value = true;
  else return true;
  return false;
}

async function loadAll() {
  loading.value = true;
  needLogin.value = false;
  noPermission.value = false;
  errorMessage.value = "";
  try {
    const [planRows, settingRows, healthData] = await Promise.all([
      fetchAdminPlans(),
      fetchBusinessSettings(),
      fetchAdminPlansHealth().catch(() => null),
    ]);
    plans.value = planRows;
    settings.value = settingRows;
    health.value = healthData;
  } catch (e: any) {
    const status = e?.status ?? e?.statusCode;
    if (status === 401) needLogin.value = true;
    else if (status === 403) noPermission.value = true;
    else errorMessage.value = "加载会员方案失败，请稍后再试";
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  form.id = "";
  form.name = "";
  form.priceYuan = "";
  form.durationDays = "";
  form.sortOrder = "0";
  form.isActive = true;
  form.isPublic = true;
}

function editPlan(plan: AdminPlanRow) {
  form.id = plan.id;
  form.name = plan.name;
  form.priceYuan = (plan.priceFen / 100).toFixed(2);
  form.durationDays = plan.durationDays === null ? "" : `${plan.durationDays}`;
  form.sortOrder = `${plan.sortOrder}`;
  form.isActive = plan.isActive;
  form.isPublic = plan.isPublic;
  actionMessage.value = "";
}

function buildPayload(): AdminPlanPayload {
  const priceFen = Math.round(Number(form.priceYuan) * 100);
  const durationRaw = form.durationDays.trim();
  return {
    name: form.name.trim(),
    priceFen,
    // 留空表示永久会员 (duration_days = null)
    durationDays: durationRaw === "" ? null : Number(durationRaw),
    sortOrder: Number(form.sortOrder),
    isActive: form.isActive,
    isPublic: form.isPublic,
  };
}

async function onSubmit() {
  busy.value = "save";
  actionMessage.value = "";
  try {
    const payload = buildPayload();
    if (!payload.name) throw { status: 400, message: "请填写方案名称" };
    if (!Number.isFinite(payload.priceFen) || (payload.priceFen as number) <= 0) {
      throw { status: 400, message: "价格必须大于 0" };
    }
    if (form.id) {
      await updateAdminPlan(form.id, payload);
      actionMessage.value = "方案已更新";
    } else {
      await createAdminPlan({
        ...payload,
        id: form.id.trim(),
        name: payload.name as string,
        priceFen: payload.priceFen as number,
      });
      actionMessage.value = "方案已创建";
    }
    resetForm();
    plans.value = await fetchAdminPlans();
    health.value = await fetchAdminPlansHealth().catch(() => health.value);
  } catch (e: any) {
    if (isSettingError(e)) {
      actionMessage.value = e?.message ?? "保存失败，请检查输入";
    }
  } finally {
    busy.value = "";
  }
}

async function togglePlan(plan: AdminPlanRow, field: "isActive" | "isPublic") {
  busy.value = plan.id;
  actionMessage.value = "";
  try {
    const updated = await updateAdminPlan(plan.id, { [field]: !plan[field] });
    plan.isActive = updated.isActive;
    plan.isPublic = updated.isPublic;
  } catch (e: any) {
    if (isSettingError(e)) actionMessage.value = e?.message ?? "操作失败";
  } finally {
    busy.value = "";
  }
}

async function removePlan(plan: AdminPlanRow) {
  busy.value = plan.id;
  actionMessage.value = "";
  try {
    await deleteAdminPlan(plan.id);
    plans.value = plans.value.filter((p) => p.id !== plan.id);
    actionMessage.value = "方案已删除";
  } catch (e: any) {
    if (isSettingError(e))
      actionMessage.value = e?.message ?? "删除失败 (已产生订单的方案请改为下架)";
  } finally {
    busy.value = "";
  }
}

async function onSettingChange(setting: BusinessSettingRow, value: string) {
  busy.value = setting.key;
  actionMessage.value = "";
  try {
    const updated = await updateBusinessSetting(setting.key, value);
    setting.value = updated.value;
    actionMessage.value = "商业参数已更新";
  } catch (e: any) {
    if (isSettingError(e)) actionMessage.value = e?.message ?? "参数不合法";
  } finally {
    busy.value = "";
  }
}

onMounted(loadAll);
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-6">
    <div class="mb-6 flex items-center gap-4">
      <h1 class="text-2xl font-bold">会员方案管理</h1>
      <nav class="flex gap-2 text-sm">
        <NuxtLink
          class="btn btn-xs"
          to="/admin"
        >
          总览
        </NuxtLink>
        <NuxtLink
          class="btn btn-xs"
          to="/admin/dashboard"
        >
          商业看板
        </NuxtLink>
        <span class="btn btn-primary btn-xs">会员方案</span>
      </nav>
    </div>

    <div
      v-if="loading"
      class="py-20 text-center"
    >
      <span class="loading loading-spinner loading-lg"></span>
    </div>

    <div
      v-else-if="needLogin"
      class="alert alert-warning justify-center"
    >
      请先登录
      <button
        class="btn btn-primary btn-sm"
        @click="signIn()"
      >
        登录
      </button>
    </div>

    <div
      v-else-if="noPermission"
      class="alert alert-error justify-center"
    >
      无管理员权限
    </div>

    <div
      v-else-if="errorMessage"
      class="alert alert-error justify-center"
    >
      {{ errorMessage }}
    </div>

    <template v-else>
      <div
        v-if="actionMessage"
        class="alert alert-info mb-4 py-2 text-sm"
      >
        {{ actionMessage }}
      </div>

      <!-- 生产安全检查: 无可售方案时明确告警, 不静默运行 -->
      <div
        v-if="health && !health.ok"
        class="alert alert-error mb-4 py-2 text-sm"
      >
        <ul>
          <li
            v-for="warning in health.warnings"
            :key="warning"
          >
            {{ warning }}
          </li>
        </ul>
      </div>

      <h2 class="mb-2 text-lg font-semibold">方案列表</h2>
      <div class="overflow-x-auto rounded-lg bg-base-200">
        <table class="table table-zebra">
          <thead>
            <tr>
              <th>ID</th>
              <th>名称</th>
              <th>价格</th>
              <th>周期</th>
              <th>排序</th>
              <th>状态</th>
              <th>销售</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="plan in plans"
              :key="plan.id"
            >
              <td class="font-mono text-xs">{{ plan.id }}</td>
              <td>{{ plan.name }}</td>
              <td>{{ yuan(plan.priceFen) }}</td>
              <td>{{ durationText(plan.durationDays) }}</td>
              <td>{{ plan.sortOrder }}</td>
              <td>
                <span :class="plan.isActive ? 'badge badge-success' : 'badge badge-ghost'">
                  {{ plan.isActive ? "启用" : "下架" }}
                </span>
              </td>
              <td>
                <span :class="plan.isPublic ? 'badge badge-info' : 'badge badge-ghost'">
                  {{ plan.isPublic ? "公开" : "隐藏" }}
                </span>
              </td>
              <td class="flex flex-wrap gap-1">
                <button
                  class="btn btn-outline btn-xs"
                  :disabled="busy === plan.id"
                  @click="editPlan(plan)"
                >
                  编辑
                </button>
                <button
                  class="btn btn-outline btn-xs"
                  :disabled="busy === plan.id"
                  @click="togglePlan(plan, 'isActive')"
                >
                  {{ plan.isActive ? "下架" : "上架" }}
                </button>
                <button
                  class="btn btn-outline btn-xs"
                  :disabled="busy === plan.id"
                  @click="togglePlan(plan, 'isPublic')"
                >
                  {{ plan.isPublic ? "隐藏" : "公开" }}
                </button>
                <button
                  class="btn btn-outline btn-error btn-xs"
                  :disabled="busy === plan.id"
                  @click="removePlan(plan)"
                >
                  删除
                </button>
              </td>
            </tr>
            <tr v-if="plans.length === 0">
              <td
                colspan="8"
                class="text-center text-base-content/60"
              >
                暂无方案
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="mt-2 text-xs text-base-content/60">
        已有订单的方案无法删除（历史订单保留下单时的价格快照），请改为下架。
      </p>

      <h2 class="mb-2 mt-8 text-lg font-semibold">
        {{ form.id ? `编辑方案：${form.id}` : "新建方案" }}
      </h2>
      <form
        class="grid gap-3 rounded-lg bg-base-200 p-4 md:grid-cols-3"
        @submit.prevent="onSubmit"
      >
        <label class="form-control">
          <span class="label-text">方案 ID (语义化, 创建后不可改)</span>
          <input
            v-model="form.id"
            class="input input-sm input-bordered"
            :disabled="!!form.id"
            placeholder="monthly"
          />
        </label>
        <label class="form-control">
          <span class="label-text">名称</span>
          <input
            v-model="form.name"
            class="input input-sm input-bordered"
            placeholder="月会员"
          />
        </label>
        <label class="form-control">
          <span class="label-text">价格 (元)</span>
          <input
            v-model="form.priceYuan"
            class="input input-sm input-bordered"
            placeholder="18.00"
          />
        </label>
        <label class="form-control">
          <span class="label-text">周期 (天, 留空 = 永久)</span>
          <input
            v-model="form.durationDays"
            class="input input-sm input-bordered"
            placeholder="30"
          />
        </label>
        <label class="form-control">
          <span class="label-text">排序</span>
          <input
            v-model="form.sortOrder"
            class="input input-sm input-bordered"
            placeholder="0"
          />
        </label>
        <div class="flex items-end gap-4">
          <label class="label cursor-pointer gap-2">
            <input
              v-model="form.isActive"
              type="checkbox"
              class="toggle toggle-sm"
            />
            <span class="label-text">启用</span>
          </label>
          <label class="label cursor-pointer gap-2">
            <input
              v-model="form.isPublic"
              type="checkbox"
              class="toggle toggle-sm"
            />
            <span class="label-text">公开销售</span>
          </label>
        </div>
        <div class="flex gap-2 md:col-span-3">
          <button
            class="btn btn-primary btn-sm"
            type="submit"
            :disabled="busy === 'save'"
          >
            {{ form.id ? "保存修改" : "创建方案" }}
          </button>
          <button
            class="btn btn-ghost btn-sm"
            type="button"
            @click="resetForm()"
          >
            重置
          </button>
        </div>
      </form>

      <h2 class="mb-2 mt-8 text-lg font-semibold">商业参数</h2>
      <div class="overflow-x-auto rounded-lg bg-base-200">
        <table class="table table-zebra">
          <thead>
            <tr>
              <th>参数</th>
              <th>值</th>
              <th>更新时间</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="setting in settings"
              :key="setting.key"
            >
              <td>
                <div class="text-sm">{{ SETTING_LABELS[setting.key] ?? setting.key }}</div>
                <div class="font-mono text-xs text-base-content/60">{{ setting.key }}</div>
              </td>
              <td>
                <input
                  :value="setting.value"
                  class="input input-sm input-bordered w-48"
                  :disabled="busy === setting.key"
                  @change="onSettingChange(setting, ($event.target as HTMLInputElement).value)"
                />
              </td>
              <td class="text-xs text-base-content/60">
                {{ setting.updatedAt ? new Date(setting.updatedAt).toLocaleString() : "-" }}
              </td>
            </tr>
            <tr v-if="settings.length === 0">
              <td
                colspan="3"
                class="text-center text-base-content/60"
              >
                暂无商业参数
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="mt-2 text-xs text-base-content/60">
        价格与周期以数据库为准；订单金额在创建时写入快照，修改方案价格不会影响历史订单。
      </p>
    </template>
  </div>
</template>

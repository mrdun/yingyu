<template>
  <div class="flex items-center">
    <UIcon
      v-if="userStore.isFounderMembership()"
      name="i-ph-crown-simple-fill"
      class="glimmer relative overflow-hidden bg-yellow-400"
      title="尊贵的创始会员,感谢您对 学以致用 的大力支持！"
      style="width: 20px; height: 20px"
    >
    </UIcon>
    <UIcon
      v-else-if="isMember"
      name="i-ph-seal-check-fill"
      class="bg-purple-500"
      title="会员"
      style="width: 20px; height: 20px"
    >
    </UIcon>
  </div>
</template>

<script setup lang="ts">
import { fetchMembershipStatus } from "~/api/membership";
import { useUserStore } from "~/store/user";

const userStore = useUserStore();
const isMember = ref(false);

onMounted(async () => {
  try {
    const res = await fetchMembershipStatus();
    isMember.value = Boolean(res?.isMember);
  } catch {
    isMember.value = false;
  }
});
</script>

<style scoped>
.glimmer {
  background: linear-gradient(-45deg, #ffd700 40%, #fafafa 50%, #ffd700 60%);
  background-size: 300%;
  background-position-x: 100%;
  animation: shimmer 2s infinite;
}

@keyframes shimmer {
  to {
    background-position-x: 0%;
  }
}
</style>

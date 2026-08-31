<template>
  <Home v-if="isLoggedIn"></Home>
  <Landing v-else></Landing>
</template>

<script setup lang="ts">
import { useAuthState } from "~/services/auth";

const { isAuthenticated: isLoggedIn } = useAuthState();
</script>

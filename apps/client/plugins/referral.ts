import { defineNuxtPlugin, useRoute } from "#imports";

import { savePendingReferralCode } from "~/services/referral";

export default defineNuxtPlugin(() => {
  const route = useRoute();
  const ref = route.query.ref;
  if (typeof ref === "string" && ref.trim()) {
    savePendingReferralCode(ref);
  }
});

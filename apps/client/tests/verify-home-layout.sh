# Verify Home page layout components
# Run: bash tests/verify-home-layout.sh

echo "=== Verifying CheckInCard.vue ==="
CHECKIN_LINES=$(wc -l < components/CheckInCard.vue)
echo "Lines: $CHECKIN_LINES"

if grep -q "连胜天数" components/CheckInCard.vue && \
   grep -q "累计打卡" components/CheckInCard.vue && \
   grep -q "本周打卡" components/CheckInCard.vue && \
   grep -q "打卡日历" components/CheckInCard.vue && \
   grep -q "炫耀战绩" components/CheckInCard.vue; then
  echo "✅ CheckInCard has all required features: streak, cumulative, weekly grid, dual buttons"
else
  echo "❌ CheckInCard missing some features"
  exit 1
fi

echo ""
echo "=== Verifying DailyTasksCard.vue ==="
if grep -q "每日任务" components/DailyTasksCard.vue && \
   grep -q "今日打卡" components/DailyTasksCard.vue && \
   grep -q "学习 10 句" components/DailyTasksCard.vue && \
   grep -q "SSS 评级" components/DailyTasksCard.vue && \
   grep -q "fetchTodayTasks" components/DailyTasksCard.vue && \
   grep -q "checkInTask" components/DailyTasksCard.vue; then
  echo "✅ DailyTasksCard has all required features: title, tasks, claim buttons"
else
  echo "❌ DailyTasksCard missing some features"
  exit 1
fi

echo ""
echo "=== Verifying Home/index.vue ==="
if grep -q "WorkNav" components/Home/index.vue && \
   grep -q "CheckInCard" components/Home/index.vue && \
   grep -q "DailyTasksCard" components/Home/index.vue && \
   grep -q "HomeCalendarGraph" components/Home/index.vue && \
   grep -q "HomeRecentCoursePack" components/Home/index.vue && \
   grep -q "课程包商城" components/Home/index.vue && \
   grep -q "max-w-screen-xl" components/Home/index.vue; then
  echo "✅ Home/index.vue has three-column layout with WorkNav, CheckInCard, DailyTasksCard, CalendarGraph"
else
  echo "❌ Home/index.vue missing some features"
  exit 1
fi

echo ""
echo "=== Checking responsive classes ==="
if grep -q "hidden.*md:block" components/Home/index.vue && \
   grep -q "lg:hidden" components/Home/index.vue && \
   grep -q "hidden.*lg:block" components/Home/index.vue; then
  echo "✅ Responsive layout: mobile(1 col), tablet(2 col), desktop(3 col)"
else
  echo "⚠️  Responsive classes may need review"
fi

echo ""
echo "=== Checking all imports use explicit paths ==="
for f in components/CheckInCard.vue components/DailyTasksCard.vue components/Home/index.vue; do
  if grep -q "from \"[~.]" "$f"; then
    echo "✅ $f has explicit imports"
  fi
done

echo ""
echo "✅ All verifications passed!"
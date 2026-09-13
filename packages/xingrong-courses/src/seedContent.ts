import { asc, eq } from "drizzle-orm";

import { db } from "@earthworm/db";
import { coursePack, learningPath, learningPathItem, pictureWord } from "@earthworm/schema";

/**
 * 预置「学习路线」与「看图学词」示例数据（对标句乐部）。
 * 运行：pnpm -F @earthworm/xingrong-courses seed:content
 * 前置：数据库已初始化，且已有 public 课程包（db:upload 或 AI 管线生成）。
 */
(async function () {
  // 1) 学习路线：把现有 public 课程包按 order 组织成「新手入门」路线
  const publicPacks = await db.query.coursePack.findMany({
    where: eq(coursePack.shareLevel, "public"),
    orderBy: asc(coursePack.order),
  });

  if (publicPacks.length > 0) {
    const existingPath = await db.query.learningPath.findFirst({
      where: eq(learningPath.title, "新手入门"),
    });

    let pathId = existingPath?.id;
    if (!pathId) {
      const [created] = await db
        .insert(learningPath)
        .values({
          title: "新手入门",
          description: "从零基础到开口说，按顺序循序渐进",
          order: 1,
          isPublished: true,
        })
        .returning();
      pathId = created.id;
    }

    for (let i = 0; i < publicPacks.length; i++) {
      const pack = publicPacks[i];
      await db
        .insert(learningPathItem)
        .values({
          learningPathId: pathId,
          coursePackId: pack.id,
          order: i,
          stage: `第 ${i + 1} 课`,
        })
        .onConflictDoNothing();
    }

    console.log(`学习路线「新手入门」已创建，包含 ${publicPacks.length} 个课程包`);
  } else {
    console.log("未找到 public 课程包，跳过学习路线预置（请先 db:upload 或生成课程）");
  }

  // 2) 看图学词：预置示例词卡（图片用占位 URL，可后续替换为真实图床）
  const sampleWords = [
    { word: "apple", chinese: "苹果", soundmark: "/ˈæpl/" },
    { word: "banana", chinese: "香蕉", soundmark: "/bəˈnɑːnə/" },
    { word: "cat", chinese: "猫", soundmark: "/kæt/" },
    { word: "dog", chinese: "狗", soundmark: "/dɔːɡ/" },
    { word: "sun", chinese: "太阳", soundmark: "/sʌn/" },
    { word: "moon", chinese: "月亮", soundmark: "/muːn/" },
  ];

  // 幂等: 该脚本会被重复执行 (如 RC 重建环境), 不能重复插入示例词卡
  let inserted = 0;
  let skipped = 0;
  for (let i = 0; i < sampleWords.length; i++) {
    const w = sampleWords[i];
    const existing = await db.query.pictureWord.findFirst({
      where: eq(pictureWord.word, w.word),
    });
    if (existing) {
      skipped++;
      continue;
    }
    await db.insert(pictureWord).values({
      word: w.word,
      chinese: w.chinese,
      soundmark: w.soundmark,
      imageUrl: `https://picsum.photos/seed/${w.word}/400/400`,
      exampleSentence: `This is a ${w.word}.`,
      order: i,
    });
    inserted++;
  }

  console.log(`看图学词: 新增 ${inserted} 个示例词卡, 已存在跳过 ${skipped} 个`);

  process.exit(0);
})();

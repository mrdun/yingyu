# 发音音频（TTS）部署说明

> 面向：运维 / 开发。用户可见效果是「练习页每句都有发音」，本文件说明音频从哪来、怎么生成、怎么上线。

## 1. 为什么需要它

练习页、看图学词、每日一句的发音原本直接取有道接口：

```
https://dict.youdao.com/dictvoice?type=2&audio=<句子原文>
```

**这是「词典词条发音」，不是语音合成**。只有词典里收录过的词条才返回音频；没收录的一律返回
`HTTP 500 {"msg":"returned null audio"}`，浏览器再以 `ERR_BLOCKED_BY_ORB` 拦掉 ——
结果就是**有的句子有声、有的完全无声，而且页面上不给任何提示**。

实测覆盖率：

| 句子长度     | 有声音  |
| ------------ | ------- |
| 1 个词       | 100%    |
| 2 个词       | 68%     |
| 3 个词       | 45%     |
| 4–5 个词     | 20%     |
| 6–8 个词     | 5%      |
| 9 个词以上   | 2%      |
| 全库随机抽样 | **36%** |

课程内容本身是「碎片渐进 → 完整句」，越到后面越读不出来；**听写模式**（整句播放）受影响最重。

## 2. 解决方式

用 **Kokoro TTS** 在本地离线生成全部句子的 mp3，作为静态文件托管；播放时按句子文本寻址。

- 模型 `Kokoro-82M`：**Apache-2.0**（可商用），工具链 MIT
- 纯 CPU 即可（实测 1 核与 16 核速度几乎相同），无需 GPU
- 实测 **1.27~1.33 句/秒**，全库 **约 1 小时**，产出 **约 80MB**（11.5KB/句）
- 零边际成本（不按字符计费）

### 播放端三级回退（缺一不可）

```
① 自有音频 var/audio/<hash>.mp3   ← 覆盖全部句子
② 有道词典发音                     ← 兜住尚未生成的句子（历史行为）
③ 浏览器内置朗读 speechSynthesis   ← 最后兜底
```

任何一级缺失都会重新出现「静默无声」，所以三级都要保留。

## 3. 生成音频

前置：本机已有一套装了 `kokoro-onnx` 的 Python 环境与模型文件（默认
`C:/Users/mrdun/github/kokoro-tts`，含 `models/kokoro-v1.0.onnx` 与 `models/voices-v1.0.bin`）。

```bash
cd <仓库根>

# 1) 确认脚本能读到句子（默认走本机 RC 库；也可用 DATABASE_URL 指向别的库）
python scripts/tts/generate-audio.py --limit 5 --speed 0.85

# 2) 全量生成（约 1 小时；可随时中断，重跑会续跑）
C:/Users/mrdun/github/kokoro-tts/.venv/Scripts/python.exe scripts/tts/generate-audio.py --speed 0.85
```

Windows 上可以直接双击 `scripts/tts/generate-audio.bat`（等价于上面第 2 条）。

常用参数：

| 参数               | 说明                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| `--speed 0.85`     | 语速，1.0 为原速；**默认 0.85**（学习场景略慢）。改语速要加 `--force` 重跑（文件名不变、内容变） |
| `--voice af_heart` | 音色。`af_*` 美音女声、`am_*` 美音男声、`bf_*`/`bm_*` 英音                                       |
| `--limit N`        | 只处理前 N 句（试跑）                                                                            |
| `--force`          | 已存在的也重新生成                                                                               |
| `--every N`        | 每 N 句打印进度、落盘 manifest（默认 50）                                                        |

产物：

```
var/audio/<16位哈希>.mp3     音频（目录已 gitignore，不入库）
var/audio/manifest.json      哈希 → 原文（核对 / 上传对账用）
```

**文件名 = 句子文本的 FNV-1a 64 位哈希**，前端用同一算法自己算地址（见
`apps/client/utils/pronunciationAudio.ts`），因此**不需要改动数据库或接口**。
同一句英文在全库重复出现时只生成一份（8,865 行 → 4,753 条唯一，省一半时间与体积）。

> ⚠️ 哈希算法两端必须一致，改任意一端都要同步另一端 —— 由
> `node scripts/tts/tests/hash-parity.mjs` 用它写出的 manifest 做对拍守护。

## 4. 上传服务器

1. 把 `var/audio/` **整个目录**（含 manifest.json）上传到对象存储 / CDN / 静态站点目录。
   仓库 `.env.example` 里已预留 `R2_BUCKET`（Cloudflare R2）与 `OSS_*`（阿里云）配置位。
2. 前端构建时提供音频基址：

```bash
export AUDIO_BASE="https://<你的CDN域名>/audio"
```

**该变量不是构建门禁项**：不提供时前端不发自有音频请求、直接走有道（即改动前的行为），
所以漏配是「退化为旧行为」而不是「构建失败」。

3. 确认产物里烘焙了基址：

```bash
grep -rhoE 'audioBase:"[^"]*"' apps/client/.output/public | sort -u
```

### 流量与存储估算

| 项              | 量级                    |
| --------------- | ----------------------- |
| 存储            | 约 80MB（4,753 个文件） |
| 单次播放        | 约 11.5KB               |
| 1,000 次播放/天 | 约 0.34GB/月            |
| 1 万次播放/天   | 约 3.4GB/月             |

浏览器会缓存音频文件，重复播放不再下载。

## 5. 本地验证（RC）

```bash
# 本地由 scripts/rc-static-server.mjs 提供 /audio/*
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" \
  http://127.0.0.1:3000/audio/<某个hash>.mp3
# 期望：200 audio/mpeg；不存在的哈希必须是 404（播放端靠它触发回退）
```

## 6. 新增课程后怎么办

音频按句子文本生成，因此：

1. 重新跑一次生成（**增量**：已存在的句子自动跳过，只补新句）；
2. 把新增的 mp3 传到同一个位置（manifest.json 一并更新）；
3. 前端无需改动、无需重建。

## 7. 验收（可重复执行）

```bash
# 跨语言哈希对拍：前端算出的地址必须能对上生成的文件
node scripts/tts/tests/hash-parity.mjs

# 真实浏览器验收：自有音频优先 / 缺失自动回退 / 无异常 JS 报错
node scripts/tts/tests/verify-pronunciation-live.mjs

# 单元测试（含回退链、哈希标准向量）
pnpm -F client exec vitest run utils/tests/pronunciationAudio.spec.ts
```

排查「没声音」时的顺序：**读页面里 `<audio>` 元素的 `src`**
（`node scripts/tts/tests/debug-audio-element.mjs`）—— 「没设置源 / 设成了错地址 / 被浏览器
autoplay 策略挡住」这三种在网络上都不报错，只有读元素才分得清。

## 8. 已知限制

- **中文不能读**。本模型符号表里只有英语音标，没有注音符号与声调（官方中文注音输出的正是这两类符号），
  所以是「表达不了」而非「读得不好」。要中文发音需换 `hexgrad/Kokoro-82M-v1.1-zh`（同为 Apache-2.0，
  已有 ONNX 版）—— 换模型即可，代码不用改。
- 英音/美音切换依赖音频文件本身：目前按**美音**（`af_heart`）生成。若要支持英音切换，
  需按音色各生成一套（体积翻倍）并让前端按用户设置选择。

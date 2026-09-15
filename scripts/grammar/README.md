# 语法标注工具链（探针阶段产物）

用于把「句子 → 语法标注」跑通，并校验它符合 `COURSE_CREATION_FORMAT.md`。
这套脚本是**探针**（验证设计可行性），不是最终实现——最终实现要进 API 的 `ai-content` 管道。

## 三个文件

| 文件                 | 作用                                                                |
| -------------------- | ------------------------------------------------------------------- |
| `system-prompt.txt`  | 交给模型的系统提示词（**改标注口径就改这里**，是唯一来源）          |
| `annotate-lesson.py` | 取一课的全部句子 → 分批调 DeepSeek → 增量落盘 → 跑规范校验          |
| `validate-format.py` | 按 `COURSE_CREATION_FORMAT.md` 的 E1–E13 / W1–W5 校验一份文件或示例 |

## 用法

```bash
# 标注一课 (默认第一课; 结果落在 $LOCALAPPDATA/Temp/ew-lesson1-annotated.json)
python scripts/grammar/annotate-lesson.py

# 校验规范文档里的示例 (E1-E13 + W1-W5)
python scripts/grammar/validate-format.py
```

## 已实测结论（2026-09-15）

- 「零基础学英语 · 第一课」**218 条全部标注成功**：218/218 返回、0 不合格、4 条告警
- 完整句 100 / 碎片 118；置信度均值 0.931、最低 0.7
- 22 次调用，23,119 输入 / 51,556 输出 token，约 4 分钟

## 关键设计（别改坏）

1. **不让模型数字符位置**。模型只输出短语/词的**原文**，偏移由脚本按空白走位算出来
   —— 这样 `english.slice(start,end) === text` 在原理上不可能违反（实测 0 次偏移错误）。
2. **`words` 与 `phrases` 是两个数组**：前者逐词标词性（每词恰一条），后者短语标成分（可跨词）。
   合成一个数组会让碎片只落一个标签、丢掉逐词词性。
3. **碎片（`isSentence=false`）不给成分**：`role`/`roleType` 必须为 `null`。
4. **`structure` 不许自由写**：只输出闭集 `pattern`，`structure` 由映射表得出
   —— 否则模型会用 20+ 种写法表达同一结构（实测教训）。
5. **分批调用**：一次给 22 条会超 `max_tokens` 导致 JSON 截断。当前每批 10 条 + `response_format: json_object`。

## 数据样本

`.hermes/design/grammar-lesson1-annotated.json` = 第一课 218 条的真实标注结果（带算好的字符位置）。
效果预览见 `.hermes/design/grammar-panel-preview.html`。

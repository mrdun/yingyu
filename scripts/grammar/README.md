# 语法标注工具链（探针阶段产物）

用于把「句子 → 语法标注」跑通，并校验它符合 `COURSE_CREATION_FORMAT.md`。
这套脚本是**探针**（验证设计可行性），不是最终实现——最终实现要进 API 的 `ai-content` 管道。

## 三个文件

| 文件                     | 作用                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| `system-prompt.txt`      | 交给模型的系统提示词（**改标注口径就改这里**，是唯一来源）                                    |
| `annotate-lesson.py`     | 取一课的全部句子 → 分批调 DeepSeek → 程序补 structure → 增量落盘 → 跑完整规则集校验（E1–E13） |
| `validate-format.py`     | 按规范校验一份文件或文档里的示例（E1–E13 / W1–W5）。**唯一校验器**                            |
| `render-preview.py`      | 渲染练习页效果预览 HTML（含**渲染自检**：每词恰好一次、胶囊数==短语数）                       |
| `measure-probe.py`       | 生成测量页。`natural` = 自然单行宽（一次量完）；`<宽>` = 该面板宽下的测量页                   |
| `measure-natural.js`     | 量出每条句子的自然单行宽（配合 `measure-probe.py natural`）                                   |
| `measure-rows.js`        | 量出「一个面板宽下每条句子占几行」（交叉验证用）                                              |
| `measure-summary.py`     | 汇总 + **模型 vs 实测交叉验证** + 按词数的单行率表                                            |
| `measure-all.sh`         | 一键全量重测（自然宽 + 6 个面板宽 + 汇总）                                                    |
| `render-long-compare.py` | 把最长的并列句在 5 个面板宽下并排渲染（评估长句方案用）                                       |

## 用法

```bash
# 标注一课 (默认第一课; 结果落在 $LOCALAPPDATA/Temp/ew-lesson1-annotated.json)
python scripts/grammar/annotate-lesson.py            # 第一课
python scripts/grammar/annotate-lesson.py 3 out.json # 第三课, 指定输出

# 校验规范文档里的示例 / 校验一份产物
python scripts/grammar/validate-format.py
python scripts/grammar/validate-format.py .hermes/design/grammar-lesson1-annotated.json

# 出效果预览（会自动跑渲染自检）
python scripts/grammar/render-preview.py

# 长句评估: 全量重测 + 单句并排对比
bash scripts/grammar/measure-all.sh
python scripts/grammar/render-long-compare.py 190
```

## 关键设计（四条，别改坏）

1. **不让模型数字符位置**。模型只输出短语/词的**原文**，偏移由脚本按空白走位算出来
   —— `english.slice(start,end) === text` 构造性成立（实测 0 次偏移错误）。
2. **不让模型写 `structure`**。模型只输出闭集 `pattern`（S/V/O/P/IO/DO/OC/C/Attrib/Adv/conj/Clause/There be），
   `structure` 由脚本按映射表算出来 —— E13 构造性成立。
   ⚠️ 实测教训：把 structure 交给模型写时，**100/100 条**与 pattern 对不上；
   改成程序映射后 **0 条**不合格。**凡是程序能确定性做对的，就别交给模型。**
3. **`words` 与 `phrases` 是两个数组**：前者逐词标词性（每词恰一条），后者短语标成分（可跨词）。
   合成一个数组会让碎片只落一个标签、丢掉逐词词性。
4. **碎片（`isSentence=false`）不给成分**：`role`/`roleType` 必须为 `null`。

## 已实测结论（2026-09-15）

- 「零基础学英语 · 第一课」**218 条全部标注成功**：完整句 100 / 碎片 118
- 完整规则集（E1–E13）**0 条不合格**；告警仅 W1 ×5（已知误报）
- `pattern` 取值收敛到 **9 种**、`clauseType` 100 条齐全（简单句 92 / 并列句 6 / 复合句 2）
- 22 次调用 + 首次重试，约 4~6 分钟

## 产物

- `.hermes/design/grammar-lesson1-annotated.json` —— 第一课 218 条真实标注（含算好的字符位置）
- `.hermes/design/grammar-panel-preview.html` —— 练习页效果预览（真实数据渲染）

"""把语法标注写进数据库（`statements.grammar` jsonb 列）。

用法:
    python scripts/grammar/ingest-lesson.py <标注json> <课id> [--db <url>] [--dry-run]

设计要点（都是踩过的坑）:
1. **先跑校验器，不通过就拒绝入库** —— 脏数据一旦进库，前台会直接渲染出错误标注。
   校验器是唯一那份 `validate-format.py`，不在这里另写一套规则。
2. **按 (course_id, order) 精确匹配**，再用 `english` 做**二次核对**：
   两边任何一个对不上就报出来并计数，绝不"差不多就写"。
3. **默认 dry-run**，确认无误再 `--commit`（本库是生产 RC 库，误写代价高）。
4. 幂等：重复执行写同一份内容；`--clear` 可把该课的 grammar 清回 NULL。

环境:
    DATABASE_URL 优先；否则用 --db；否则回落到 RC 库 (localhost:5480/earthworm_rc)。
"""
import json
import os
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
VALIDATOR = REPO / "scripts/grammar/validate-format.py"
DEFAULT_DB = "postgres://test:password@localhost:5480/earthworm_rc"


def run_validator(path: Path) -> bool:
    r = subprocess.run([sys.executable, str(VALIDATOR), str(path)],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    out = (r.stdout or "") + (r.stderr or "")
    tail = [ln for ln in out.strip().splitlines() if ln.strip()][-3:]
    print("校验器输出:")
    for ln in tail:
        print("   " + ln)
    return r.returncode == 0


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = {a for a in sys.argv[1:] if a.startswith("--")}
    if len(args) < 2:
        raise SystemExit(__doc__)

    src, course_id = Path(args[0]), args[1]
    db_url = os.environ.get("DATABASE_URL") or DEFAULT_DB
    for i, a in enumerate(sys.argv):
        if a == "--db":
            db_url = sys.argv[i + 1]
    commit = "--commit" in flags
    clear = "--clear" in flags

    data = json.load(open(src, encoding="utf-8"))
    print(f"标注文件: {src.name} —— {len(data)} 条；课 id: {course_id}")
    print(f"目标库: {db_url.split('@')[-1]}；模式: "
          f"{'清空(--clear)' if clear else ('写入(--commit)' if commit else '试运行(dry-run)')}")

    if not clear:
        if not run_validator(src):
            raise SystemExit("✗ 校验器未通过 —— 拒绝入库（先修数据，不要绕过）")
        print("✓ 校验通过")

    try:
        import psycopg2  # type: ignore
    except ImportError:
        raise SystemExit("需要 psycopg2：pip install psycopg2-binary")

    conn = psycopg2.connect(db_url)
    conn.autocommit = False
    cur = conn.cursor()

    cur.execute("""SELECT column_name FROM information_schema.columns
                   WHERE table_name='statements' AND column_name='grammar'""")
    if not cur.fetchone():
        raise SystemExit("✗ statements.grammar 列不存在 —— 先跑迁移（drizzle-kit migrate）")

    cur.execute("""SELECT "order", english FROM statements WHERE course_id=%s""", (course_id,))
    db_rows = {int(o): e for o, e in cur.fetchall()}
    if not db_rows:
        raise SystemExit(f"✗ 库里没有 course_id={course_id} 的句子")
    print(f"库内该课句子: {len(db_rows)} 条")

    if clear:
        cur.execute("UPDATE statements SET grammar=NULL WHERE course_id=%s", (course_id,))
        print(f"→ 已清空 {cur.rowcount} 条")
        if commit:
            conn.commit()
            print("✓ 已提交")
        else:
            conn.rollback()
            print("（dry-run，已回滚）")
        return

    missing, mismatch, ok = [], [], 0
    for rec in data:
        order = int(rec.get("order"))
        if order not in db_rows:
            missing.append(order)
            continue
        if db_rows[order] != rec["english"]:
            mismatch.append((order, db_rows[order], rec["english"]))
            continue
        ok += 1

    print(f"可写入 {ok} 条；库里缺 {len(missing)} 条；英文对不上 {len(mismatch)} 条")
    for o in missing[:5]:
        print(f"   缺 order={o}")
    for o, a, b in mismatch[:5]:
        print(f"   对不上 order={o}: 库={a!r} / 标注={b!r}")
    if mismatch:
        raise SystemExit("✗ 有 english 对不上的记录 —— 拒绝写入（先查清是同一课吗）")

    n = 0
    for rec in data:
        order = int(rec.get("order"))
        if order not in db_rows:
            continue
        payload = json.dumps(rec["annotation"], ensure_ascii=False)
        cur.execute("""UPDATE statements SET grammar=%s::jsonb, updated_at=now()
                       WHERE course_id=%s AND "order"=%s""", (payload, course_id, order))
        n += cur.rowcount
    print(f"→ 影响 {n} 行")
    if commit:
        conn.commit()
        print("✓ 已提交")
    else:
        conn.rollback()
        print("（dry-run，已回滚；加 --commit 才真正写入）")
    cur.close()
    conn.close()


if __name__ == "__main__":
    main()

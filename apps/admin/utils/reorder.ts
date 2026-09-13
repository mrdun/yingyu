/**
 * 上移 / 下移排序。
 *
 * 本批次**没有**新增任何后端接口: 排序复用既有的单条更新接口
 *  - 课程: PATCH /admin/courses/:courseId   (DTO 含 @IsInt() order)
 *  - 语句: PATCH /admin/statements/:statementId (DTO 含 @IsInt() order)
 * 这里只负责算出"相邻两条应该换成什么 order", 由调用方逐条发送那两个既有接口。
 *
 * 与"数字 order 直接编辑"是同一件事的两种入口: 都写 order 字段, 不存在批量端点。
 */

export interface OrderSwapPayload {
  id: string;
  order: number;
}

/**
 * 计算相邻两项交换后的 order。
 *
 * 返回 null 表示"没有相邻项"(已经在首位/末位, 或下标越界) —— 调用方据此提示,
 * 不要发一个把 order 写成 -1 的请求 (后端 DTO 是 @Min(0))。
 */
export function buildOrderSwapPayloads<T extends { id: string; order: number }>(
  items: readonly T[],
  index: number,
  direction: -1 | 1,
): OrderSwapPayload[] | null {
  if (index < 0 || index >= items.length) return null;

  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= items.length) return null;

  const current = items[index];
  const neighbor = items[targetIndex];
  if (!current || !neighbor) return null;

  // order 允许重复 (手工录入): 此时用数组下标兜底, 保证两条不会互相顶成同一个值
  const currentOrder = neighbor.order === current.order ? targetIndex : neighbor.order;
  const neighborOrder = neighbor.order === current.order ? index : current.order;

  return [
    { id: current.id, order: currentOrder },
    { id: neighbor.id, order: neighborOrder },
  ];
}

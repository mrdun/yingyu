import { Injectable } from "@nestjs/common";

import { MembershipService } from "../membership/membership.service";

export interface CoursePackAccessTarget {
  status: string;
  accessLevel: string | null;
  isFree: boolean | null;
}

/**
 * 课程访问统一判断:
 * - 未发布 (status != published) 用户端不可见;
 * - free 任何用户可访问;
 * - membership 必须有效会员 (status=active 且 end_date>now 或永久);
 * - 管理员通过 admin 接口访问, 不受此限制。
 */
@Injectable()
export class CourseAccessService {
  constructor(private readonly membershipService: MembershipService) {}

  async canAccess(userId: string | null, pack: CoursePackAccessTarget): Promise<boolean> {
    if (pack.status !== "published") return false;

    const accessLevel = pack.accessLevel ?? (pack.isFree ? "free" : "membership");
    if (accessLevel === "free") return true;

    if (!userId) return false;
    return await this.membershipService.isMember(userId);
  }
}

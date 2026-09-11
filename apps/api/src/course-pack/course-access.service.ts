import { Injectable } from "@nestjs/common";

import { MembershipService } from "../membership/membership.service";

export interface CoursePackAccessTarget {
  status: string;
  accessLevel: string | null;
  isFree: boolean | null;
}

/**
 * 课程访问统一判断 (所有用户端课程访问必须经过此入口):
 * - 未发布 (status != published) 用户端不可见;
 * - free 任何用户可访问;
 * - membership 必须有效会员 (membership_periods 派生的 end_date 有效, 非 isActive)。
 */
@Injectable()
export class CourseAccessService {
  constructor(private readonly membershipService: MembershipService) {}

  private resolveAccessLevel(pack: CoursePackAccessTarget): "free" | "membership" {
    return (pack.accessLevel ?? (pack.isFree ? "free" : "membership")) as "free" | "membership";
  }

  /** 是否能查看课程基本信息 (商城/详情页)。仅 published 可见, draft/review/archived 不可见。 */
  canViewCoursePack(pack: CoursePackAccessTarget): boolean {
    return pack.status === "published";
  }

  /** 是否能进入学习内容。free 任何人可学; membership 必须有效会员。 */
  async canStudyCoursePack(userId: string | null, pack: CoursePackAccessTarget): Promise<boolean> {
    if (pack.status !== "published") return false;
    if (this.resolveAccessLevel(pack) === "free") return true;
    if (!userId) return false;
    return await this.membershipService.isMember(userId);
  }
}

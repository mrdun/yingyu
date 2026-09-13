import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { AuthGuard, Permissions } from "../guards/auth.guard";
import {
  CreateLearningPathDto,
  CreateLearningPathItemDto,
  SetLearningPathPublishedDto,
  UpdateLearningPathDto,
  UpdateLearningPathItemDto,
} from "./dto/learning-path.dto";
import { LearningPathsAdminService } from "./learning-paths.service";

/**
 * isPublished 查询参数: 只认 "true"/"false"。
 * 其它值 (含空串) 视为「不过滤」—— 与 status/source 这类字符串过滤同一语义,
 * 不因为一个拼错的筛选值就让整个列表 400。
 */
function parseIsPublished(value?: string): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

/**
 * 学习路线管理端 (O-04 批次)。9 个端点, 全部 @Permissions("admin:access"):
 *  - GET    /admin/learning-paths                 全部路线 (含未发布) + 分页 + isPublished 过滤
 *  - GET    /admin/learning-paths/:id             详情 + 条目 (含课程包标题)
 *  - POST   /admin/learning-paths                 新建 (默认未发布)
 *  - PATCH  /admin/learning-paths/:id             改 title/description/cover/order
 *  - PATCH  /admin/learning-paths/:id/publish     发布 / 下架 (幂等)
 *  - DELETE /admin/learning-paths/:id             删除 (事务内连带删除条目)
 *  - POST   /admin/learning-paths/:id/items       添加条目 (重复课程包 → 409)
 *  - PATCH  /admin/learning-path-items/:itemId    改条目 (阶段/排序/课程包, 重复 → 409)
 *  - DELETE /admin/learning-path-items/:itemId    删除条目
 *
 * 公开接口 (GET /learning-path、GET /learning-path/:id) 的可见性逻辑不变:
 * 游客与会员仍然只看到 isPublished = true 的路线。
 */
@Controller("admin")
@UseGuards(AuthGuard)
@Permissions("admin:access")
export class LearningPathsAdminController {
  constructor(private readonly learningPathsService: LearningPathsAdminService) {}

  @Get("learning-paths")
  @Permissions("admin:access")
  async list(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("isPublished") isPublished?: string,
  ) {
    const p = Math.max(Number(page) || 1, 1);
    const ps = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
    return await this.learningPathsService.list({
      page: p,
      pageSize: ps,
      isPublished: parseIsPublished(isPublished),
    });
  }

  @Get("learning-paths/:id")
  @Permissions("admin:access")
  async detail(@Param("id") id: string) {
    return await this.learningPathsService.detail(id);
  }

  @Post("learning-paths")
  @Permissions("admin:access")
  async create(@Body() dto: CreateLearningPathDto) {
    return await this.learningPathsService.create(dto);
  }

  @Patch("learning-paths/:id")
  @Permissions("admin:access")
  async update(@Param("id") id: string, @Body() dto: UpdateLearningPathDto) {
    return await this.learningPathsService.update(id, dto);
  }

  /** 发布 / 下架 (幂等): 重复设置同一个值仍是 200, 返回当前状态 */
  @Patch("learning-paths/:id/publish")
  @Permissions("admin:access")
  async publish(@Param("id") id: string, @Body() dto: SetLearningPathPublishedDto) {
    return await this.learningPathsService.setPublished(id, dto.isPublished);
  }

  @Delete("learning-paths/:id")
  @Permissions("admin:access")
  async remove(@Param("id") id: string) {
    return await this.learningPathsService.remove(id);
  }

  @Post("learning-paths/:id/items")
  @Permissions("admin:access")
  async createItem(@Param("id") id: string, @Body() dto: CreateLearningPathItemDto) {
    return await this.learningPathsService.addItem(id, dto);
  }

  @Patch("learning-path-items/:itemId")
  @Permissions("admin:access")
  async updateItem(@Param("itemId") itemId: string, @Body() dto: UpdateLearningPathItemDto) {
    return await this.learningPathsService.updateItem(itemId, dto);
  }

  @Delete("learning-path-items/:itemId")
  @Permissions("admin:access")
  async removeItem(@Param("itemId") itemId: string) {
    return await this.learningPathsService.removeItem(itemId);
  }
}

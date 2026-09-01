import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";

import { learningPath, learningPathItem } from "@earthworm/schema";
import { DB, DbType } from "../global/providers/db.provider";

@Injectable()
export class LearningPathService {
  constructor(@Inject(DB) private db: DbType) {}

  async findAll() {
    const paths = await this.db.query.learningPath.findMany({
      where: eq(learningPath.isPublished, true),
      orderBy: asc(learningPath.order),
      with: {
        items: {
          orderBy: asc(learningPathItem.order),
        },
      },
    });

    return paths.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      cover: p.cover,
      order: p.order,
      coursePackCount: p.items.length,
    }));
  }

  async findOne(id: string) {
    const path = await this.db.query.learningPath.findFirst({
      where: eq(learningPath.id, id),
      with: {
        items: {
          orderBy: asc(learningPathItem.order),
          with: {
            coursePack: true,
          },
        },
      },
    });

    if (!path) {
      throw new NotFoundException(`LearningPath with ID ${id} not found`);
    }

    return {
      id: path.id,
      title: path.title,
      description: path.description,
      cover: path.cover,
      items: path.items.map((item) => ({
        stage: item.stage,
        order: item.order,
        coursePack: item.coursePack,
      })),
    };
  }
}

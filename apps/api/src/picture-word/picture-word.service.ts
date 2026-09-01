import { Inject, Injectable } from "@nestjs/common";
import { asc } from "drizzle-orm";

import { pictureWord } from "@earthworm/schema";
import { DB, DbType } from "../global/providers/db.provider";

@Injectable()
export class PictureWordService {
  constructor(@Inject(DB) private db: DbType) {}

  async findAll() {
    return await this.db.query.pictureWord.findMany({
      orderBy: asc(pictureWord.order),
    });
  }
}

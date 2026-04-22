// src/controllers/modelFileController.ts
import { ModelFile } from "../entities/ModelFile";

export interface ListParams {
  search?: string;
  modelId: number | "";
  userId: number | "";
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

export async function getModelFiles(params: ListParams) {
  const {
    search,
    modelId,
    userId,
    dateFrom,
    dateTo,
    limit = 20,
    offset = 0,
  } = params;

  const qb = ModelFile.createQueryBuilder("mf")
    .leftJoinAndSelect("mf.model", "model")
    .leftJoinAndSelect("mf.user", "user")
    .leftJoinAndSelect("mf.testRuns", "testRuns");

  if (search) {
    qb.andWhere("mf.filename ILIKE :search", { search: `%${search}%` });
  }
  if (modelId) {
    qb.andWhere("model.id = :modelId", { modelId });
  }
  if (userId) {
    qb.andWhere("user.id = :userId", { userId });
  }
  if (dateFrom) {
    qb.andWhere("mf.uploadedAt >= :dateFrom", { dateFrom });
  }
  if (dateTo) {
    qb.andWhere("mf.uploadedAt <= :dateTo", { dateTo });
  }

  qb.take(limit).skip(offset).orderBy("mf.uploadedAt", "DESC");

  return qb.getManyAndCount();
}

export async function getModelFileById(id: number) {
  const item = await ModelFile.findOne({
    where: { id },
    relations: ["model", "user", "testRuns"],
  });
  if (!item) throw new Error("NOT_FOUND");
  return item;
}

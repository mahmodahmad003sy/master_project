import "reflect-metadata";
import { DataSource } from "typeorm";
import config from "../config/default.json";
import { ComparisonRun } from "./entities/ComparisonRun";
import { DocumentType } from "./entities/DocumentType";
import { Model } from "./entities/Model";
import { User } from "./entities/User";

export const AppDataSource = new DataSource({
  type: config.db.type as any,
  host: config.db.host,
  port: config.db.port,
  username: config.db.username,
  password: config.db.password,
  database: config.db.database,
  synchronize: config.db.synchronize,
  logging: config.db.logging,
  entities: [Model, User, DocumentType, ComparisonRun],
});

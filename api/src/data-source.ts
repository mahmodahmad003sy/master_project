// src/data-source.ts
import "reflect-metadata"; // ← must come first
import { DataSource } from "typeorm";
import config from "../config/default.json";
import { Model } from "./entities/Model";
import { ModelFile } from "./entities/ModelFile";
import { User } from "./entities/User";
import { TestRun } from "./entities/TestRun";

export const AppDataSource = new DataSource({
  type: config.db.type as any, // e.g. "postgres"
  host: config.db.host,
  port: config.db.port,
  username: config.db.username,
  password: config.db.password,
  database: config.db.database,
  synchronize: config.db.synchronize,
  logging: config.db.logging,
  entities: [Model, User, ModelFile, TestRun],
});

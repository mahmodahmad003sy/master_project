import "reflect-metadata";
import {
  Connection,
  ConnectionOptions,
  createConnection,
  getConnectionManager,
} from "typeorm";
import config from "../config/default.json";
import { Benchmark } from "./entities/Benchmark";
import { ComparisonRun } from "./entities/ComparisonRun";
import { DocumentType } from "./entities/DocumentType";
import { Model } from "./entities/Model";
import { User } from "./entities/User";

const connectionOptions: ConnectionOptions = {
  type: config.db.type as any,
  host: config.db.host,
  port: config.db.port,
  username: config.db.username,
  password: config.db.password,
  database: config.db.database,
  synchronize: config.db.synchronize,
  logging: config.db.logging,
  entities: [Model, User, DocumentType, ComparisonRun, Benchmark],
};

export const AppDataSource = {
  async initialize(): Promise<Connection> {
    const manager = getConnectionManager();

    if (manager.has("default")) {
      const existing = manager.get("default");
      if (!existing.isConnected) {
        await existing.connect();
      }
      return existing;
    }

    return createConnection(connectionOptions);
  },
};

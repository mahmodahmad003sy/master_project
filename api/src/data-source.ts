import "reflect-metadata";
import { Connection, createConnection, getRepository } from "typeorm";
import config from "./config";
import { Benchmark } from "./entities/Benchmark";
import { ComparisonRun } from "./entities/ComparisonRun";
import { DocumentType } from "./entities/DocumentType";
import { Model } from "./entities/Model";
import { AppSetting } from "./entities/AppSetting";
import { User } from "./entities/User";

let connection: Connection | null = null;

export const AppDataSource = {
  async initialize(): Promise<Connection> {
    if (!connection) {
      connection = await createConnection({
        type: "postgres",
        host: config.db.host,
        port: config.db.port,
        username: config.db.username,
        password: config.db.password,
        database: config.db.database,
        synchronize: config.db.synchronize,
        logging: config.db.logging,
        entities: [
          AppSetting,
          Model,
          User,
          DocumentType,
          ComparisonRun,
          Benchmark,
        ],
      });
    }

    if (!connection.isConnected) {
      await connection.connect();
    }

    return connection;
  },

  async destroy(): Promise<void> {
    if (connection) {
      await connection.close();
      connection = null;
    }
  },

  getRepository,

  get isInitialized(): boolean {
    return Boolean(connection?.isConnected);
  },
};

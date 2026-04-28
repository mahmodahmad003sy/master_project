import "dotenv/config";
import path from "path";
import baseConfig from "../config/default.json";

type DbConfig = {
  type: string;
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  synchronize: boolean;
  logging: boolean;
};

type AppConfig = {
  server: {
    port: number;
  };
  auth: {
    jwtSecret: string;
  };
  MODELS_BASE_PATH: string;
  DETECTION_SERVICE_URL: string;
  COMPARE_SERVICE_URL: string;
  PUBLIC_API_URL: string;
  COLAB_SYNC_TOKEN: string;
  RUNS_BASE_PATH: string;
  db: DbConfig;
};

const apiRoot = path.resolve(__dirname, "../..");

function readString(name: string, fallback: string): string {
  const value = process.env[name];
  return value == null || value === "" ? fallback : value;
}

function readNumber(name: string, fallback: number): number {
  const value = process.env[name];
  if (value == null || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value == null || value === "") {
    return fallback;
  }

  return value.toLowerCase() === "true";
}

const config: AppConfig = {
  ...baseConfig,
  server: {
    ...baseConfig.server,
    port: readNumber("PORT", baseConfig.server.port),
  },
  auth: {
    ...baseConfig.auth,
    jwtSecret: readString("JWT_SECRET", baseConfig.auth.jwtSecret),
  },
  MODELS_BASE_PATH: readString(
    "MODELS_BASE_PATH",
    path.join(apiRoot, "tmp"),
  ),
  DETECTION_SERVICE_URL: readString(
    "DETECTION_SERVICE_URL",
    baseConfig.DETECTION_SERVICE_URL,
  ),
  COMPARE_SERVICE_URL: readString(
    "COMPARE_SERVICE_URL",
    baseConfig.COMPARE_SERVICE_URL,
  ),
  PUBLIC_API_URL: readString("PUBLIC_API_URL", baseConfig.PUBLIC_API_URL),
  COLAB_SYNC_TOKEN: readString(
    "COLAB_SYNC_TOKEN",
    baseConfig.COLAB_SYNC_TOKEN,
  ),
  RUNS_BASE_PATH: readString(
    "RUNS_BASE_PATH",
    path.join(apiRoot, "tmp", "runs"),
  ),
  db: {
    ...baseConfig.db,
    host: readString("DB_HOST", baseConfig.db.host),
    port: readNumber("DB_PORT", baseConfig.db.port),
    username: readString("DB_USERNAME", baseConfig.db.username),
    password: readString("DB_PASSWORD", baseConfig.db.password),
    database: readString("DB_DATABASE", baseConfig.db.database),
    synchronize: readBoolean("DB_SYNCHRONIZE", baseConfig.db.synchronize),
    logging: readBoolean("DB_LOGGING", baseConfig.db.logging),
  },
};

export default config;

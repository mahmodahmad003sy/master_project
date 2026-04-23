// src/app.ts
import "reflect-metadata"; // must be first
import express, { NextFunction, Request, Response } from "express";
import multer from "multer";
import path from "path";
import cors from "cors";
import "dotenv/config";
import routes from "./routes";
import { AppDataSource } from "./data-source";
import { Benchmark } from "./entities/Benchmark";
import config from "../config/default.json";
import { ensureRunsRoot, RUNS_ROOT } from "./services/runStorage";

const upload = multer({ dest: "tmp/" });
const app = express();
const buildPath = path.join(__dirname, "../../../react/build");

declare global {
  namespace Express {
    interface Request {
      upload: typeof upload;
    }
  }
}

app.use(
  cors({
    origin: "*",
    credentials: true,
  })
);
app.use(express.json());

app.use((req: Request, _res: Response, next: NextFunction) => {
  req.upload = upload;
  next();
});

AppDataSource.initialize()
  .then(async () => {
    console.log("DataSource initialized");
    await ensureRunsRoot();
    await Benchmark.createQueryBuilder()
      .update({ status: "failed" })
      .where({ status: "running" })
      .execute();
    console.log(`Runs root ready at ${RUNS_ROOT}`);
    app.listen(config.server.port, () =>
      console.log(`Listening on http://localhost:${config.server.port}`)
    );
  })
  .catch((err) => console.error("DataSource init failed:", err));

app.use("/api", routes);
app.use(express.static(buildPath));

app.get("/", (_req: Request, res: Response) => {
  res.sendFile(path.join(buildPath, "index.html"));
});

app.get(/^\/(?!api(?:\/|$)).*/, (_req: Request, res: Response) => {
  res.sendFile(path.join(buildPath, "index.html"));
});

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.statusCode ?? 500;
  if (status >= 500) {
    console.error(err);
  }

  res.status(status).json({ error: err.message ?? "Internal Server Error" });
});

// src/app.ts
import "reflect-metadata"; // ← must be first
import express, { Request, Response, NextFunction } from "express";
import multer from "multer";
import routes from "./routes";
import { AppDataSource } from "./data-source";
import config from "../config/default.json";
import "dotenv/config";
import cors from "cors";
const upload = multer({ dest: "tmp/" });
const app = express();
import path from "path";
import { error } from "console";
const buildPath = path.join(__dirname, "../client/build");

// so TS knows about req.upload
declare global {
  namespace Express {
    interface Request {
      upload: typeof upload;
    }
  }
}
app.use(
  cors({
    origin: "*", // your React dev server
    credentials: true, // if you need to send cookies
  })
);
app.use(express.json());

// attach multer instance
app.use((req: Request, _res: Response, next: NextFunction) => {
  req.upload = upload;
  next();
});

// initialize TypeORM then start server
AppDataSource.initialize()
  .then(() => {
    console.log("✔️ DataSource initialized");
    app.listen(config.server.port, () =>
      console.log(`🚀 Listening on http://localhost:${config.server.port}`)
    );
  })
  .catch((err) => console.error("❌ DataSource init failed:", err));

// mount your routes
app.use("/api", routes);

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  const status = err.statusCode ?? 500;
  console.log({ err });

  res.status(status).json({ error: err.message ?? "Internal Server Error" });
});
app.use(express.static(buildPath));

app.get("/", (req: Request, res: Response) => {
  res.sendFile(path.join(buildPath, "index.html"));
});

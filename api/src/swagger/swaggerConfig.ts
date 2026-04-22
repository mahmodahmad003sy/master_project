import { Options } from "swagger-jsdoc";

export const swaggerOptions: Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Model Management API",
      version: "1.0.0",
      description:
        "HTTP API for registering models, datasets, uploading model files, and running tests",
    },
    servers: [
      { url: "http://localhost:3000/api", description: "Local server" },
      { url: "https://aiserv.smartlilac.com/api", description: "online server" },
    ],
  },
  // scan only these files for @openapi JSDoc blocks
  apis: ["./src/swagger/*.swagger.ts"],
};

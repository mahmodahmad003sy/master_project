FROM node:20-bookworm-slim AS react-build
WORKDIR /app/react
COPY react/package*.json ./
RUN npm ci
COPY react/ ./
RUN npm run build

FROM node:20-bookworm-slim AS api-build
WORKDIR /app/api
COPY api/package*.json ./
RUN npm ci
COPY api/ ./
RUN npm run tsc

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=api-build /app/api/package*.json ./api/
COPY --from=api-build /app/api/node_modules ./api/node_modules
COPY --from=api-build /app/api/dist ./api/dist
COPY --from=react-build /app/react/build ./react/build

EXPOSE 3000
WORKDIR /app/api
CMD ["node", "dist/src/app.js"]

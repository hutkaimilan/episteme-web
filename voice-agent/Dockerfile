# Two stages: the build image carries TypeScript and dev dependencies, the
# runtime image carries neither. Keeps the deployed surface small and stops a
# compiler from shipping to production.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# Non-root: this process is reachable from the public internet.
USER node
EXPOSE 8080
CMD ["node", "dist/server.js"]

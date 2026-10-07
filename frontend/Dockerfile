# Build the standalone server, then run it as a non-root user.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S eregion && adduser -S eregion -G eregion
COPY --from=build --chown=eregion:eregion /app/.next/standalone ./
COPY --from=build --chown=eregion:eregion /app/.next/static ./.next/static
COPY --from=build --chown=eregion:eregion /app/public ./public
USER eregion
EXPOSE 3000
# BACKEND_URL is read when the server starts: where the API runs, for the /api proxy.
CMD ["node", "server.js"]

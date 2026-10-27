FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG ORIGIN=http://localhost:3000
ENV ORIGIN=$ORIGIN
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 BODY_SIZE_LIMIT=12M
WORKDIR /app
RUN groupadd --gid 10001 portal && useradd --uid 10001 --gid portal --create-home portal \
    && mkdir -p /data/uploads && chown portal:portal /data/uploads
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/build ./build
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src/lib/server ./src/lib/server
COPY --from=build /app/challenges ./challenges
COPY --from=build /app/static ./static
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/examples ./examples
USER portal
EXPOSE 3000
CMD ["sh", "-c", "npm run db:seed && node build"]

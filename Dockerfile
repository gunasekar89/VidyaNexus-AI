# Build the React app, then run it and the API from one small Node image.
# The base image comes from the AWS public mirror of Docker Hub, which avoids
# Docker Hub pull limits on shared lab machines.
FROM public.ecr.aws/docker/library/node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM public.ecr.aws/docker/library/node:22-bookworm-slim
ENV NODE_ENV=production \
    TZ=Asia/Kolkata \
    PORT=3000 \
    DATABASE_FILE=/data/vidyanexus.db
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY server ./server
COPY shared ./shared
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]

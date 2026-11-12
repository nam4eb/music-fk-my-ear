FROM node:22-alpine
WORKDIR /app
COPY package.json package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/core/package.json packages/core/package.json
RUN npm install --no-audit --no-fund
COPY packages/core packages/core
COPY apps/api apps/api
RUN npm run build:core && npm run build:api
ENV NODE_ENV=production PORT=4000
EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]

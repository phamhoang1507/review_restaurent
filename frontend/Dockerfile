# syntax=docker/dockerfile:1.7
FROM node:24.22.1-alpine3.23@sha256:0468540aa58203ff9e40c2aab3907c52644ab818af6176b1c70a026137dc92a2 AS development

ENV NODE_ENV=development \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_UPDATE_NOTIFIER=false

WORKDIR /app

RUN chown node:node /app

USER node

COPY --chown=node:node package.json package-lock.json ./

RUN --mount=type=cache,target=/home/node/.npm,uid=1000,gid=1000 \
    npm ci

COPY --chown=node:node .oxlintrc.json index.html tsconfig.json vite.config.ts ./
COPY --chown=node:node src ./src
COPY --chown=node:node tests ./tests

RUN npm run check \
    && rm -rf dist /tmp/localspot-vite-cache

EXPOSE 5173

CMD ["npm", "run", "dev"]

FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev --no-audit --no-fund

COPY --chown=node:node . .

RUN mkdir -p /app/storage-data/codebases && chown -R node:node /app/storage-data

ENV NODE_ENV=production
USER node

EXPOSE 5000

CMD ["npm","start"]

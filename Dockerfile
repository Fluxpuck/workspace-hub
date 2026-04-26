FROM node:22-alpine

WORKDIR /app

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn .yarn
RUN yarn install --immutable

COPY server.js ./
COPY lib/ lib/
COPY tools/ tools/

ENTRYPOINT ["node", "server.js"]

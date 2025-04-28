FROM node:20

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm i -g pnpm
RUN pnpm install

COPY . .

RUN pnpm prisma generate
RUN pnpm run build

EXPOSE 3001

CMD ["node", "dist/main"]

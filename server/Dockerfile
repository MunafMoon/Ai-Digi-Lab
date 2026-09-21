FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
COPY server/package*.json ./server/
RUN npm install --workspace server
COPY server ./server
WORKDIR /app/server
RUN npm run build
EXPOSE 4000
CMD ["npm", "run", "dev"]

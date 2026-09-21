FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
COPY client/package*.json ./client/
RUN npm install --workspace client
COPY client ./client
WORKDIR /app/client
EXPOSE 5173
CMD ["npm", "run", "dev"]

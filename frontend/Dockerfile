# Build stage
FROM node:24-alpine AS build

WORKDIR /app

# Build arguments for Vite (baked in at build time)
ARG VITE_API_URL
ARG VITE_SOCKET_URL
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine

# Port configuration (used by nginx template)
ENV FRONTEND_PORT=7011
ENV BACKEND_PORT=7012

# Copy build files
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx config as template (envsubst processes it on startup)
COPY nginx.conf /etc/nginx/templates/default.conf.template


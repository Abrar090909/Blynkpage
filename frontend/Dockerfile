# ==============================================================================
# Production Dockerfile for Blynkpages Frontend (Vite + Nginx)
# ==============================================================================

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Build optimized static distribution
RUN npm run build

# Production web server stage
FROM nginx:1.27-alpine AS runner

# Remove default configuration
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom hardened nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy build artifacts
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

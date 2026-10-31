# Build context is the REPO ROOT (the web app imports packages/shared).
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace packages/shared --workspace apps/web --no-audit --no-fund

COPY packages/shared packages/shared
COPY apps/web apps/web

# Vite bakes VITE_* values into the JavaScript at build time
ARG VITE_API_URL=http://localhost:4000
ARG VITE_RAZORPAY_KEY_ID=
ENV VITE_API_URL=$VITE_API_URL VITE_RAZORPAY_KEY_ID=$VITE_RAZORPAY_KEY_ID
RUN npm run build -w apps/web

# Static files served by nginx (tiny image, no Node at runtime)
FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80

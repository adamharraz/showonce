FROM node:24-bookworm-slim AS frontend
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements-lock.txt backend/requirements-lock.txt
RUN pip install --no-cache-dir -r backend/requirements-lock.txt
COPY backend/ backend/
COPY --from=frontend /build/dist frontend/dist
ENV PYTHONPATH=/app/backend PYTHONUNBUFFERED=1 ALLOW_LOCAL_LOGIN=false
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --ws-max-size 1500000"]

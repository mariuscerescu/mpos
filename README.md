# OCR Microservices Platform

An asynchronous optical character recognition platform built with a modular microservices architecture. Users can upload images, trigger background OCR pipelines, and inspect extracted text via a unified web UI.

## Service Overview

- **Frontend**: SPA served with Vite, communicates only with the API Gateway.
- **API Gateway**: FastAPI service acting as single entry point. Handles authentication, request routing, rate limiting, and response aggregation.
- **User Service**: Manages accounts, hashed credentials, refresh tokens, and JWT claims.
- **Document Service**: Stores original images, preprocessing variants, and OCR outputs. Coordinates job state transitions.
- **Custom Message Broker**: Lightweight Python service offering REST-based enqueue/claim/ack endpoints backed by PostgreSQL persistence.
- **Image Preprocessing Service**: Applies deskewing, denoising, grayscale, and sharpening before OCR.
- **OCR Service**: Runs Hugging Face English OCR transformer models to extract text from processed images.
- **Worker Service**: Orchestrates multi-step pipelines, translating document events into broker tasks.

## Infrastructure

- **PostgreSQL**: Primary data store for users, documents, and broker queues.
- **Docker Compose**: Containers orchestrated for local development; each service ships with its own Dockerfile.

---

Refer to `docs/architecture.md` for diagrams and detailed message flows once available.

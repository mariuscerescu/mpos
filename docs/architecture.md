# Architecture Notes

## High-Level Flow

1. User uploads an image via the frontend.
2. API Gateway authenticates and forwards upload to the Document Service.
3. Document Service stores the binary payload and enqueues a preprocessing task in the custom broker.
4. Image Preprocessing Service claims the task, transforms the image, and re-enqueues an OCR task.
5. OCR Service extracts text with a Hugging Face model and updates the Document Service.
6. Frontend polls processed document metadata and renders the extracted content.

## Components

- API Gateway: FastAPI app handling JWT issuance/verification and routing.
- User Service: FastAPI CRUD + authentication over PostgreSQL.
- Document Service: FastAPI, stores files/text and drives workflow state.
- Broker Service: REST queue with persistence (PostgreSQL) and visibility timeouts.
- Worker Service: Coordinates multi-step pipelines and emits telemetry.
- Preprocessing Service: OpenCV-based image cleanup (deskew, grayscale, denoise, sharpen).
- OCR Service: Hugging Face transformer (`microsoft/trocr-base-printed`) for English text recognition.

## Data Storage

- PostgreSQL (users, documents metadata, binary blobs, broker tasks).
- Optional future S3-compatible object storage for large binaries.

## Security

- JWT access tokens (short-lived) signed with HS256 shared secret.
- Refresh tokens stored hashed in User Service.
- Gateway acts as trusted reverse proxy for downstream services.

## Observability

- Structured JSON logging across services.
- Health checks exposed via `/health` endpoints.
- Metrics endpoints planned for queue depth, job duration, and model latency.

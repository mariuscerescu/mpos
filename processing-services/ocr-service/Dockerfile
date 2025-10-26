FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app:/app/shared

COPY processing-services/ocr-service/requirements.txt ./requirements.txt
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir -r requirements.txt

COPY processing-services/ocr-service/src ./src
COPY shared/python ./shared

CMD ["python", "-m", "src.main"]

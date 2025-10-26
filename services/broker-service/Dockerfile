FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app:/app/shared

COPY services/broker-service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY services/broker-service/src ./src
COPY services/broker-service/migrations ./migrations
COPY services/broker-service/alembic.ini ./alembic.ini
COPY infrastructure/broker/definitions.json ./definitions.json
COPY shared/python ./shared

COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8003"]

FROM python:3.12-slim
WORKDIR /app
COPY requirements-service.txt ./
RUN pip install --no-cache-dir -r requirements-service.txt
COPY src ./src
COPY service ./service
RUN mkdir -p /app/models && useradd --create-home --shell /usr/sbin/nologin saple
USER saple
ENV ML_MODEL_DIR=/app/models
EXPOSE 8000
CMD ["uvicorn", "service.app:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]

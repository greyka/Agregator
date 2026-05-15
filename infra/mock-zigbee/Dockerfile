FROM python:3.12-slim

WORKDIR /app
RUN pip install --no-cache-dir paho-mqtt==2.1.0

COPY mock.py /app/mock.py
CMD ["python", "-u", "/app/mock.py"]

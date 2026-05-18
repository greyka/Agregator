FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1

# Build deps required for python-miio (netifaces, cryptography wheels not always available)
RUN apt-get update \
 && apt-get install -y --no-install-recommends gcc python3-dev libffi-dev libssl-dev \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN pip install -r /app/requirements.txt \
 && apt-get purge -y gcc python3-dev libffi-dev libssl-dev \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/* /root/.cache

COPY app /app/app

EXPOSE 8000
# Note: no --reload here. uvicorn's --reload re-imports modules on file change,
# which reincarnates the discovery registry as a fresh singleton — silently
# losing every device that was already found. Iterate with the deploy script
# instead; the backend container restarts cleanly in <2s.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

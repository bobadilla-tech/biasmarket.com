FROM postgres:18-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-boto3 restic curl \
    && rm -rf /var/lib/apt/lists/*

COPY infra/vps/backup.py /usr/local/libexec/biasmarket-backup.py

ENTRYPOINT ["python3", "/usr/local/libexec/biasmarket-backup.py"]

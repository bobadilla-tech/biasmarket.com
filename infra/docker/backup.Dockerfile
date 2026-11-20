FROM postgres:18-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-boto3 restic curl \
    && useradd --uid 10001 --create-home --shell /usr/sbin/nologin backup \
    && rm -rf /var/lib/apt/lists/*

COPY infra/vps/backup.py /usr/local/libexec/biasmarket-backup.py

USER backup
ENTRYPOINT ["python3", "/usr/local/libexec/biasmarket-backup.py"]

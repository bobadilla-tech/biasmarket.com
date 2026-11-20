FROM postgres:18-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-boto3 restic curl \
    && useradd --uid 10001 --user-group --create-home --home-dir /home/biasmarket-backup \
         --shell /usr/sbin/nologin biasmarket-backup \
    && rm -rf /var/lib/apt/lists/*

COPY infra/vps/backup.py /usr/local/libexec/biasmarket-backup.py

USER biasmarket-backup
ENTRYPOINT ["python3", "/usr/local/libexec/biasmarket-backup.py"]

#!/bin/sh
# Backs up every MongoDB database, compressed, to /var/backups/muzieklab, keeping the 14 newest (docs/DEPLOY.md).
# Run nightly by muzieklab-backup.timer; run it by hand any time with: sudo /opt/muzieklab-mongo/backup.sh
set -eu
umask 077

dir=/var/backups/muzieklab
file="$dir/mongo-$(date -u +%Y-%m-%dT%H%MZ).archive.gz"
install -d -m 700 "$dir"

# The root password stays inside the container: mongodump reads it from a config file there, not the command line.
docker exec muzieklab-mongo sh -c '
  umask 077
  printf "password: %s\n" "$MONGO_INITDB_ROOT_PASSWORD" > /tmp/backup.yaml
  mongodump --config /tmp/backup.yaml -u "$MONGO_INITDB_ROOT_USERNAME" --authenticationDatabase admin \
    --archive --gzip --quiet
  status=$?
  rm -f /tmp/backup.yaml
  exit $status' > "$file.part"
mv "$file.part" "$file"

ls -1t "$dir"/mongo-*.archive.gz | tail -n +15 | xargs -r rm -f
echo "backed up to $file ($(du -h "$file" | cut -f1))"

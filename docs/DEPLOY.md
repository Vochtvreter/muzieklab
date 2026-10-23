# Deploying to your own server

Muzieklab is a static site: `npm run build` writes it to `dist/`, and any web server can serve those files. The app
routes with `#` hashes, so the server needs no rewrite rules. Two sites run on our own server, deployed the same way
(`.github/workflows/deploy-site.yml`):

| Site | Folder on the server | Deploys | Workflow |
|---|---|---|---|
| https://vivanova.app (production) | `/var/www/muzieklab` | every push to `main` | `deploy.yml`, *Deploy to production* |
| https://test.vivanova.app (test) | `/var/www/muzieklab-test` | every push to `test`, or any branch by hand | `deploy-test.yml`, *Deploy to test* |

Each site can also have the API (`server/`) next to it; see *The API* below.

## How a deploy works

1. GitHub Actions runs the unit tests and builds the site. A failing test stops the deploy, so a broken `main` never
   reaches the live site.
2. It uploads the build over SSH (rsync) to a new folder, `releases/<commit>/`, on the server.
3. It points the `current` symlink at that folder in one step, so no visitor ever gets a half-new site. The web server
   serves `current`.
4. It keeps the five newest releases for a rollback, and checks that the site answers.

```
/var/www/muzieklab/
├── current -> releases/3f2c1e…
└── releases/
    ├── 3f2c1e…/   (newest, live)
    ├── a91b07…/
    └── …          (five in all)
```

Only one deploy runs at a time; a push that lands during a deploy waits for it.

## Set up the server (once)

These steps are for Ubuntu or Debian; other Linux servers work the same way with their own package manager. You need
a domain (or subdomain) for the site.

### 1. Point the domain at the server

Add an `A` record (and `AAAA` for IPv6) for the domain, `vivanova.app`, with the server's IP
address.

### 2. Install a web server and rsync

[Caddy](https://caddyserver.com) is the simplest: it gets and renews the HTTPS certificate on its own.

```sh
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl rsync
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

Already running nginx? Keep it, install `rsync`, and use `deploy/nginx.conf` in step 5 instead.

Open the ports if the server has a firewall: `sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443`.

### 3. Create a deploy user and the site folder

The deploy logs in as its own user, which can only write the site folder.

```sh
sudo adduser --disabled-password --gecos "" deploy
sudo mkdir -p /var/www/muzieklab
sudo chown deploy:deploy /var/www/muzieklab
```

### 4. Give GitHub a key for the deploy user

On your own computer, make a key pair just for deploys (no passphrase, as GitHub has to use it unattended):

```sh
ssh-keygen -t ed25519 -N "" -C "github-actions muzieklab" -f muzieklab-deploy
```

This writes `muzieklab-deploy` (the private key, for GitHub) and `muzieklab-deploy.pub` (the public key, for the
server). On the server, let the public key in, limited with `restrict` so it can copy files but not open a terminal or
forward ports:

```sh
sudo install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
echo "restrict $(cat muzieklab-deploy.pub)" | sudo tee -a /home/deploy/.ssh/authorized_keys
sudo chown deploy:deploy /home/deploy/.ssh/authorized_keys && sudo chmod 600 /home/deploy/.ssh/authorized_keys
```

(Paste the contents of `muzieklab-deploy.pub` in place of `$(cat …)` if the file is not on the server.)

Then read the server's host key, so GitHub knows it is talking to your server and not an impostor:

```sh
ssh-keyscan -t ed25519 vivanova.app        # add -p 2222 if SSH is not on port 22
```

Check that the key it prints is the server's own: on the server, `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`
shows its fingerprint, and `ssh-keyscan … | ssh-keygen -lf -` on your computer must show the same one.

### 5. Configure the web server

Caddy: copy `deploy/Caddyfile` to `/etc/caddy/Caddyfile`, then:

```sh
sudo systemctl reload caddy
```

nginx: copy `deploy/nginx.conf` to `/etc/nginx/sites-available/muzieklab`, then:

```sh
sudo ln -s /etc/nginx/sites-available/muzieklab /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx && sudo certbot --nginx -d vivanova.app
```

Both configs cache the hashed files in `assets/` for a year and have browsers check everything else (the page, the
service worker, the manifest) on every visit, so each deploy reaches people on their next visit.

### 6. Add the settings to GitHub

In the repository on GitHub: **Settings → Secrets and variables → Actions**.

| Kind | Name | Value |
|---|---|---|
| Secret | `DEPLOY_SSH_KEY` | The whole private key file `muzieklab-deploy`, including the `BEGIN` and `END` lines |
| Secret | `DEPLOY_KNOWN_HOSTS` | The line `ssh-keyscan` printed in step 4 |
| Variable | `DEPLOY_HOST` | `vivanova.app` |
| Variable | `DEPLOY_USER` | `deploy` |
| Variable | `DEPLOY_PATH` | `/var/www/muzieklab` |
| Variable | `DEPLOY_PORT` | Only if SSH is not on port 22 |
| Variable | `PRODUCTION_URL` | `https://vivanova.app/` (the deploy checks it answers, and links it) |

Add them under the **Repository** tabs (not an environment): the workflow is skipped until `DEPLOY_HOST` is set, so
`main` stays green before the server is ready. Once the private key is in GitHub, delete it from your computer.

### 7. Deploy

**Actions → Deploy to production → Run workflow** deploys `main` right away. After that, every push to `main` deploys
by itself. The run's summary links the live site.

## The test site

https://test.vivanova.app is a second copy of the app on the same server, for trying a change before it reaches
`main`. It has its own folder and its own releases, and search engines are told to leave it out (`X-Robots-Tag`).
Progress and settings are kept per site in the browser, so playing on the test site never touches production's.

**Deploy a branch to it** in either of two ways:

- **Actions → Deploy to test → Run workflow**, and pick the branch under *Use workflow from*.
- Push it to the `test` branch: `git push --force origin my-branch:test`. Every push to `test` deploys by itself.

Only one version is on the test site at a time: the latest deploy wins.

### Set up the test site (once)

1. **DNS:** an `A` record with name `test` and the server's IP address (in Hetzner DNS: *Records → Add record*).
2. **Folder**, on the server:

   ```sh
   sudo mkdir -p /var/www/muzieklab-test
   sudo chown deploy:deploy /var/www/muzieklab-test
   ```

3. **Caddy:** copy `deploy/Caddyfile` to `/etc/caddy/Caddyfile` (it has production, `www` and test), then
   `sudo systemctl reload caddy`. Caddy gets the certificate for test.vivanova.app by itself.
4. **GitHub**, under *Settings → Secrets and variables → Actions → Variables*, two more repository variables. The SSH
   key, host key and server variables are the same as production's.

   | Variable | Value |
   |---|---|
   | `TEST_DEPLOY_PATH` | `/var/www/muzieklab-test` |
   | `TEST_URL` | `https://test.vivanova.app/` |

5. **Deploy:** *Actions → Deploy to test → Run workflow* with `main`, to check it works.

## The API

The API (`server/`, [BACKEND-PLAN.md](BACKEND-PLAN.md)) runs next to each site: one bundled file,
`server.cjs`, started by systemd, with MongoDB in Docker. Caddy passes `/api/*` to it. Today it only answers
`GET /api/v1/health`; accounts follow in phase 1. It runs on the test site first.

| | Test | Production (later) |
|---|---|---|
| Health | https://test.vivanova.app/api/v1/health | https://vivanova.app/api/v1/health |
| Service | `muzieklab-api@test`, port 3001 | `muzieklab-api@production`, port 3000 |
| Releases | `/srv/muzieklab-api/test` | `/srv/muzieklab-api/production` |
| Settings | `/etc/muzieklab-api/test.env` | `/etc/muzieklab-api/production.env` |
| Database | `muzieklab_test`, user `muzieklab_test` | `muzieklab`, user `muzieklab` |
| GitHub variable | `TEST_API_PATH` | `API_PATH` |

**A deploy** with the variable set does this before switching the app:

1. It uploads the API to `releases/<commit>/`, points `current` at it, and restarts the service. The `deploy` user
   may run exactly that restart with sudo (`deploy/api/sudoers`), and nothing else.
2. It waits up to a minute for `/api/v1/health` to answer with this commit and `"db":"ok"`.
3. If it doesn't, it **switches the API back** to the release before and restarts it, and the deploy fails, so the
   app is not switched either.

**MongoDB** runs as a one-node replica set (so the API can use transactions), with passwords, listening on
`127.0.0.1` only. Each site's API has its own database user, which can only use that site's database.

**Backups:** every night at 03:17 UTC, `muzieklab-backup.timer` writes a compressed dump of all databases to
`/var/backups/muzieklab/` and keeps the 14 newest. They stay on the server; turn on Hetzner's server backups too
(*Cloud Console → the server → Backups*), so a lost server does not take its backups with it.

### Set up the API (once per server, then once per site)

All of this runs on the server, as your own user. The files named come from this repository.

1. **Docker and Node:**

   ```sh
   sudo apt install -y docker.io docker-compose-v2 nodejs
   docker compose version; node --version          # Node must be v22 or newer
   ```

2. **MongoDB** in `/opt/muzieklab-mongo`: copy `deploy/mongo/compose.yaml` and `deploy/mongo/backup.sh` there, then
   make the root password and the replica set key, start it, and start the replica set:

   ```sh
   cd /opt/muzieklab-mongo
   sudo chmod 755 backup.sh
   sudo sh -c 'umask 077; printf "MONGO_INITDB_ROOT_USERNAME=root\nMONGO_INITDB_ROOT_PASSWORD=%s\n" "$(openssl rand -hex 24)" > .env'
   sudo sh -c 'umask 077; openssl rand -base64 756 > keyfile' && sudo chown 999:999 keyfile
   sudo docker compose up -d
   sudo docker exec muzieklab-mongo sh -c 'mongosh -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --quiet --eval "
     try { rs.status().ok } catch (e) { rs.initiate({ _id: \"rs0\", members: [{ _id: 0, host: \"127.0.0.1:27017\" }] }).ok }"'
   ```

   Nobody types the passwords: they are made here and stay in `.env` (root only) and the container.

3. **Backups:** copy `deploy/mongo/muzieklab-backup.service` and `.timer` to `/etc/systemd/system/`, then:

   ```sh
   sudo systemctl daemon-reload && sudo systemctl enable --now muzieklab-backup.timer
   sudo /opt/muzieklab-mongo/backup.sh                # one now, to check it works
   ```

4. **The API's user, service and sudo rule:** copy `deploy/api/muzieklab-api@.service` to `/etc/systemd/system/`, then:

   ```sh
   sudo useradd --system --no-create-home --shell /usr/sbin/nologin muzieklab-api
   sudo install -m 440 /dev/stdin /etc/sudoers.d/muzieklab-deploy < sudoers     # deploy/api/sudoers
   sudo visudo -c && sudo systemctl daemon-reload
   ```

5. **A site** (here `test`; for production use `production`, `muzieklab`, port 3000): its database user, its
   settings file, its folder, and the service (which starts with the first deploy):

   ```sh
   SITE=test DB=muzieklab_test PORT=3001
   PW=$(openssl rand -hex 24)
   sudo docker exec -e U="$DB" -e P="$PW" muzieklab-mongo sh -c 'mongosh -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --quiet --eval "
     db.getSiblingDB(\"admin\").createUser({ user: process.env.U, pwd: process.env.P, roles: [{ role: \"readWrite\", db: process.env.U }] }).ok"'
   sudo install -d -m 755 /etc/muzieklab-api
   printf 'PORT=%s\nMONGODB_URI=mongodb://%s:%s@127.0.0.1:27017/%s?authSource=admin&replicaSet=rs0\n' "$PORT" "$DB" "$PW" "$DB" \
     | sudo install -m 600 /dev/stdin /etc/muzieklab-api/$SITE.env
   unset PW
   sudo install -d -m 755 /srv/muzieklab-api && sudo install -d -m 755 -o deploy -g deploy /srv/muzieklab-api/$SITE
   sudo systemctl enable muzieklab-api@$SITE
   ```

6. **Caddy:** copy `deploy/Caddyfile` to `/etc/caddy/Caddyfile` (the test site's block has the `/api/*` route), then
   `sudo systemctl reload caddy`.
7. **GitHub:** the repository variable `TEST_API_PATH` = `/srv/muzieklab-api/test` (production: `API_PATH` =
   `/srv/muzieklab-api/production`). Then run *Deploy to test*, and open https://test.vivanova.app/api/v1/health.

### Look after it

```sh
systemctl status muzieklab-api@test                       # running?
journalctl -u muzieklab-api@test -n 50                    # its log (JSON lines)
sudo docker ps; sudo docker logs --tail 50 muzieklab-mongo
ls -lh /var/backups/muzieklab/                            # last night's backup
```

**Restore** a backup (this replaces what is in the database now; `--nsInclude` limits it to one database):

```sh
sudo docker exec -i muzieklab-mongo sh -c 'umask 077; printf "password: %s\n" "$MONGO_INITDB_ROOT_PASSWORD" > /tmp/r.yaml
  mongorestore --config /tmp/r.yaml -u "$MONGO_INITDB_ROOT_USERNAME" --authenticationDatabase admin --archive --gzip \
    --drop --nsInclude "muzieklab_test.*"; rm -f /tmp/r.yaml' < /var/backups/muzieklab/mongo-<date>.archive.gz
```

**Roll the API back** like the app: `cd /srv/muzieklab-api/test`, point `current` at an older release (as in *Roll
back* below), then `sudo systemctl restart muzieklab-api@test`.

## Roll back

Each run deploys the commit it was started for, so the quickest rollback is to open an older successful run (from the
last 30 days) of *Deploy to production* in the Actions tab and choose **Re-run all jobs**. The next push to `main`
deploys as usual.

Without GitHub, on the server (as `deploy`, or with `sudo -u deploy`), point `current` at one of the kept releases
(`/var/www/muzieklab-test` for the test site):

```sh
cd /var/www/muzieklab
ls -t releases/                                      # newest first
ln -sfn releases/<commit> current.tmp && mv -Tf current.tmp current
```

## When a deploy fails

- **Host key verification failed:** `DEPLOY_KNOWN_HOSTS` does not match the server (or the port). Run `ssh-keyscan`
  again (step 4) and check the fingerprint.
- **Permission denied (publickey):** the public key is not in `/home/deploy/.ssh/authorized_keys`, the file or folder
  is not owned by `deploy`, or `DEPLOY_SSH_KEY` is not the whole private key.
- **rsync: command not found:** install `rsync` on the server.
- **Check the API fails:** the API did not answer with this commit within a minute, and the deploy switched it back.
  `journalctl -u muzieklab-api@test -n 50` on the server shows why (often MONGODB_URI, or MongoDB not running).
- **sudo: a password is required:** `/etc/sudoers.d/muzieklab-deploy` is missing or names another service.
- **Check the live site fails:** the files are on the server but the web server does not serve them; check the domain
  and root in the Caddyfile or nginx config, and `sudo journalctl -u caddy` (or `/var/log/nginx/error.log`).

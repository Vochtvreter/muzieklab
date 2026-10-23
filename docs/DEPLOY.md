# Deploying to your own server

Muzieklab is a static site: `npm run build` writes it to `dist/`, and any web server can serve those files. The app
routes with `#` hashes, so the server needs no rewrite rules. Production runs on your own server:
`.github/workflows/deploy.yml` deploys every push to `main`.

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

## Roll back

Each run deploys the commit it was started for, so the quickest rollback is to open an older successful run (from the
last 30 days) of *Deploy to production* in the Actions tab and choose **Re-run all jobs**. The next push to `main`
deploys as usual.

Without GitHub, on the server (as `deploy`, or with `sudo -u deploy`), point `current` at one of the kept releases:

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
- **Check the live site fails:** the files are on the server but the web server does not serve them; check the domain
  and root in the Caddyfile or nginx config, and `sudo journalctl -u caddy` (or `/var/log/nginx/error.log`).

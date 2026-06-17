# APB Automation Worker — VPS Deployment Guide (Step by Step)

এই ফাইলে আপনি শূন্য থেকে শুরু করে একটা **Ubuntu 22.04 / 24.04 VPS**-এ APB Worker চালু করবেন। প্রতিটা command copy-paste করার জন্য রেডি।

---

## 0. VPS কেনার সময় কী দেখবেন

| Spec | Minimum | Recommended |
|---|---|---|
| OS | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |
| RAM | 1 GB | 2 GB (Playwright Chromium-এর জন্য) |
| CPU | 1 vCPU | 2 vCPU |
| Disk | 20 GB SSD | 40 GB SSD |
| Bandwidth | 1 TB | 2 TB |
| Location | যেখানে provider panel দ্রুত লোড হয় (সাধারণত Singapore / India) |

**Provider suggestion:** Contabo, Hetzner, DigitalOcean, Vultr, Linode।

---

## 1. VPS-এ প্রথম login

আপনার hosting provider আপনাকে IP + root password দেবে। নিজের কম্পিউটার থেকে:

```bash
ssh root@YOUR_VPS_IP
```

Password বসান। প্রথমবার `yes` লিখে fingerprint accept করুন।

---

## 2. System update + basic tools

```bash
apt update && apt upgrade -y
apt install -y curl git ufw build-essential ca-certificates gnupg
```

---

## 3. Non-root user বানান (security best practice)

```bash
adduser apb            # password দিন, বাকি field Enter চেপে skip
usermod -aG sudo apb
su - apb               # এখন থেকে এই user-এ কাজ করব
```

---

## 4. Firewall (UFW) configure করুন

```bash
sudo ufw allow OpenSSH
sudo ufw enable        # 'y' লিখুন
sudo ufw status
```

Worker outbound calls করে, কোনো inbound port দরকার নেই।

---

## 5. Node.js 20 install করুন (NodeSource থেকে)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v        # v20.x.x দেখাবে
npm -v
```

---

## 6. Playwright dependencies install করুন

Playwright Chromium চালাতে কিছু system library লাগে:

```bash
sudo apt install -y \
  libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
  libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
  libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2t64 \
  libatspi2.0-0 fonts-liberation
```

> Ubuntu 22.04 হলে `libasound2t64`-এর বদলে `libasound2` লিখুন।

---

## 7. APB Worker code কপি করুন

দুইটা option:

### Option A — Git থেকে clone (recommended)

আপনার Lovable project যদি GitHub-এ connect করা থাকে:

```bash
cd ~
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git apb
cd apb/automation-worker
```

### Option B — শুধু worker folder upload

নিজের PC থেকে:

```bash
# Local machine-এ run করুন:
scp -r ./automation-worker apb@YOUR_VPS_IP:~/
```

তারপর VPS-এ:

```bash
cd ~/automation-worker
```

---

## 8. Dependencies install + Chromium download

```bash
npm install
npx playwright install chromium
```

(প্রায় 300 MB download হবে, এক-দুই মিনিট লাগতে পারে।)

---

## 9. Environment file বানান

```bash
cp .env.example .env
nano .env
```

ভিতরে fill করুন:

```env
APB_BASE_URL=https://YOUR-APB-DOMAIN.lovable.app
APB_WORKER_TOKEN=wrk_xxxxxxxxxxxxxxxxxxxxxxxxxxx
POLL_INTERVAL_MS=1000
CONCURRENCY=3
BROWSER_PROFILES_DIR=./browser-profiles
HEADLESS=true
```

- `APB_BASE_URL` = আপনার published Lovable app-এর URL।
- `APB_WORKER_TOKEN` = Admin Dashboard → **Workers** → "+ New Worker" থেকে copy করা token। একবারই দেখাবে।

Save: `Ctrl+O`, Enter, `Ctrl+X`.

---

## 10. Manual test run

```bash
npm start
```

Console-এ দেখবেন:
```
APB worker starting → https://...  concurrency=3, headless=true
```

Admin Dashboard → Workers page-এ এই worker-এর status `online` হয়ে যাবে।

Test transaction trigger করুন (Admin → Transactions → manual বা panel থেকে)। Worker log-এ দেখবেন:
```
[aps_xxxx] OK
```

বন্ধ করতে: `Ctrl+C`।

---

## 11. Production-এ চালু রাখুন (PM2 দিয়ে)

PM2 হলো process manager — VPS reboot হলেও auto start, crash হলে auto restart।

```bash
sudo npm install -g pm2

cd ~/automation-worker
pm2 start "npm start" --name apb-worker
pm2 save
pm2 startup
```

শেষ command একটা `sudo env PATH=... pm2 startup ...` দেবে — সেটা copy করে paste করুন। এতে boot-এ auto start enable হবে।

দরকারি command:

```bash
pm2 status               # সব process দেখুন
pm2 logs apb-worker      # live log
pm2 restart apb-worker   # restart
pm2 stop apb-worker      # stop
pm2 monit                # CPU/RAM dashboard
```

---

## 12. Log rotation (disk full হওয়া আটকাতে)

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 10
pm2 set pm2-logrotate:compress true
```

---

## 13. Auto-update (optional)

যদি git clone করে থাকেন, update করতে:

```bash
cd ~/apb
git pull
cd automation-worker
npm install
pm2 restart apb-worker
```

---

## 14. Headless মোডে browser ঠিকমতো চলছে কিনা check

কখনো provider site bot detection করে headless block করে। সেক্ষেত্রে temporarily `HEADLESS=false` দিয়ে VNC বা x11 দিয়ে দেখুন। সাধারণত দরকার হয় না।

---

## 15. Browser profile backup

`./browser-profiles/<provider-id>/` folder-এ login session save থাকে। হারালে আবার login হবে (কোনো ক্ষতি নেই), কিন্তু backup নিতে চাইলে:

```bash
tar czf profiles-backup.tar.gz browser-profiles/
```

---

## 16. Troubleshooting

| সমস্যা | সমাধান |
|---|---|
| `Unauthorized` log | `.env`-এ `APB_WORKER_TOKEN` ভুল → নতুন token নিন |
| `Cannot find module 'playwright'` | `npm install` আবার করুন |
| `browserType.launch: Executable doesn't exist` | `npx playwright install chromium` |
| `Missing X server or $DISPLAY` | `HEADLESS=true` রাখুন `.env`-এ |
| RAM 90%+ | `CONCURRENCY` কমান (3 → 1) |
| Provider login fail | Admin → Providers → flow_config-এর selector ঠিক করুন |
| Worker offline দেখাচ্ছে dashboard-এ | `pm2 logs apb-worker` দেখুন; firewall/internet চেক করুন |

---

## 17. Security checklist (final)

- [ ] root login disabled, SSH key-only (optional but recommended)
- [ ] UFW enabled
- [ ] Worker token কখনো git-এ commit করেননি (`.env` `.gitignore`-এ আছে)
- [ ] VPS-এ অন্য কোনো untrusted service নেই
- [ ] PM2 startup enabled
- [ ] Log rotation on

---

## এক নজরে পুরো command sequence

```bash
ssh root@YOUR_VPS_IP
apt update && apt upgrade -y
apt install -y curl git ufw build-essential
adduser apb && usermod -aG sudo apb && su - apb
sudo ufw allow OpenSSH && sudo ufw enable
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo apt install -y libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
  libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
  libgbm1 libpango-1.0-0 libcairo2 libasound2t64 libatspi2.0-0 fonts-liberation
git clone https://github.com/YOU/YOUR_REPO.git apb
cd apb/automation-worker
npm install
npx playwright install chromium
cp .env.example .env && nano .env     # fill values
npm start                             # test once, Ctrl+C
sudo npm install -g pm2
pm2 start "npm start" --name apb-worker
pm2 save && pm2 startup               # follow printed command
```

ব্যাস — worker live।

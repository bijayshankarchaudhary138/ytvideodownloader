# Free me live karna — 3 simple tarike (Hindi + English)

**Paid server zaroori NAHI hai.** Neeche 3 free options hain. Apni zarurat dekh kar
chuno:

| Option | Kitna free | Kaha chalta hai | Asli YouTube download | Best kis liye |
| --- | --- | --- | --- | --- |
| **1. Apna PC + Cloudflare Tunnel** | 100% free | Tumhara laptop/PC | ✅ haan (ghar ka IP) | "Dosto ko link bhejna hai" / demo |
| **2. Render free plan** | 100% free | Internet (cloud) | ⚠️ kabhi block hota hai | 24×7 URL chahiye, kam traffic |
| **3. Oracle Cloud Always Free VM** | 100% free (hamesha) | Internet (cloud) | ⚠️ kabhi block hota hai | 24×7 + control chahiye |
| *Paid VPS (optional)* | ₹300–500/month | Internet | ✅ best | Bahut traffic / 4K |

**Sabse aasan pehla kadam:** Option 1. 5 minute me public link mil jayega, koi
credit card nahi, koi signup nahi.

---

## Option 1 — Apna PC + Cloudflare Tunnel (free, best for real downloads)

Kyun best: tumhare ghar ka internet IP use hota hai, aur YouTube aam taur pe
"datacenter IPs" ko block karta hai — ghar ka IP block nahi hota. Iska matlab
asli videos download karne me sabse zyada chance.

```bash
# 1. computer pe project chalao (production build)
npm install
npm run setup        # yt-dlp + ffmpeg download
npm run build

DEMO_MODE=off npm start        # http://localhost:8080

# 2. dusre terminal me public link banao
npx -y cloudflared tunnel --url http://localhost:8080
```

Terminal me aisa line aayega:

```
+--------------------------------------------------------------------------------------------+
|  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |
|  https://random-words-1234.trycloudflare.com                                               |
+--------------------------------------------------------------------------------------------+
```

**Yahi tumhara live link hai** — kisi ko bhi bhej sakte ho, HTTPS ke saath.
Jab tak terminal khula hai (aur PC on hai) tab tak site chalti hai. Band karne ke
liye `Ctrl+C`.

> Tip: isetnpm script ke roop me bhi chala sakte ho — `npm run tunnel`
> (same command, `http://localhost:8080` par).

**Deployment check:** pehli baar browser me apna `trycloudflare.com` link kholo,
link paste karo, download karo. Agar chala — mubarak ho, tumhara downloader
internet pe live hai. 🎉

---

## Option 2 — Render free plan (24×7 URL, GitHub se auto-deploy)

Repo me already `render.yaml` file hai — bas blueprint create karna hai.

1. **GitHub** par repo kholo: `https://github.com/bijayshankarchaudhary138/ytvideodownloader`
2. `https://dashboard.render.com` → **Sign up with GitHub** (free, card nahi chahiye)
3. **New +** → **Blueprint** → repo `ytvideodownloader` select karo → **Apply**
4. Render `render.yaml` padh kar Docker image banayega (~5–10 min pehli baar)
5. Ready hone par URL milega: `https://ytvideodownloader-xxxx.onrender.com` → kholo
6. (Optional) **Environment** me `SITE_URL` = apna Render URL daal do, taaki
   canonical/OG/sitemap sahi links dikhaye

**Sach jo tumhe pata hona chahiye:**

- Free service **~15 min traffic na aane par so jati hai**. Agli request par
  jaagne me 30–60 second lagte hain (pehla page slow khulega, phir normal).
- **Disk nahi hota** → restart/deploy par purani downloaded files chali jati hain
  (dobara download kar lo, koi harm nahi).
- CPU chhota hai → `mp4-720`, `mp3` theek; **4K slow** hoga.
- Render ka IP YouTube block kar sakta hai → tab error aayega `BOT_CHECK`.
  Us case me **Environment → `DEMO_MODE=on`** kar do: site phir bhi pura chalega
  (sample media ke saath), sirf asli YouTube download band rahega.
- Chahiye asli 4K + 24×7 + koi sleep nahi → **paid VPS** (neeche ₹300–500/month)
  ya **Option 3**.

---

## Option 3 — Oracle Cloud "Always Free" VM (free hamesha, 24×7)

Oracle ka Always Free tier asli VM deta hai (ARM, 24 GB tak RAM), hamesha ke liye
free — bas signup me card verify karna padta hai (charge nahi lagega free tier me).

1. `https://www.oracle.com/cloud/free/` → sign up → **Create instance**
2. Image: **Ubuntu 22.04**, shape: **VM.Standard.A1.Flex** (Always Free eligible)
3. Instance ban jaane par SSH se login karo, phir:

```bash
sudo apt update && sudo apt install -y nodejs npm python3 nginx git
sudo adduser --system --group --home /opt/ytvideodownloader ytvd
sudo -u ytvd git clone https://github.com/bijayshankarchaudhary138/ytvideodownloader.git /opt/ytvideodownloader
cd /opt/ytvideodownloader
sudo -u ytvd npm ci --omit=dev && sudo -u ytvd npm run setup && sudo -u ytvd npm run build

sudo cp deploy/ytvideodownloader.service /etc/systemd/system/
sudo systemctl enable --now ytvideodownloader
curl -fsS localhost:8080/api/health      # {"status":"ok",...}

# public URL (port 80) — ya apna domain + free HTTPS:
sudo cp deploy/nginx.conf /etc/nginx/sites-available/ytvd
sudo sed -i 's/dl.example.com/'"$(curl -s ifconfig.me)"'/g' /etc/nginx/sites-available/ytvd
sudo ln -sf /etc/nginx/sites-available/ytvd /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx
```

Oracle console me **Security List → Ingress → port 80 (aur 443) allow** karna na
bhoolo, warna bahar se site nahi khulegi.

Domain add karna ho (jaise `download.mysite.com`): Cloudflare (free) me DNS
point kar do VM IP pe → `sudo certbot --nginx -d download.mysite.com` → free HTTPS.

---

## Paid VPS (agar chahiye ho) — kitna lagta hai

Zaroori nahi, par sabse smooth experience:

| Provider | Plan | Price | Note |
| --- | --- | --- | --- |
| Hetzner | CX22 (2 vCPU, 4 GB) | ~€4/month | sabse sasta + fast, region Germany/Singapore |
| DigitalOcean | Basic Droplet 2 GB | $6/month (~₹500) | India (Bangalore) region available |
| Contabo / Netcup | 4 GB+ | ~€4–5 | sasta, thoda slow support |
| Oracle Cloud | Always Free ARM | ₹0 | free, par setup thoda technical |

VPS par steps wahi hain jo Option 3 me hain (git clone → setup → build → systemd →
nginx). Sab commands `docs/DEPLOY.md` §5 me copy-paste ready hain.

**Traffic/disk ka hisaab:** 1 download ≈ 5–50 MB (video ki quality par). 100
downloads/din + 6 ghante TTL ≈ 5–15 GB disk chahiye. Chhota VPS bhi kaafi hai.

---

## Free me kya-kya limits aati hain (honest list)

| Limit | Detail |
| --- | --- |
| YouTube IP block | Cloud/datacenter IP pe `BOT_CHECK` aa sakta hai. Ghar ka PC (Option 1) me ye problem nahi. |
| CPU | Free tiers slow: 1080p mux chalega, 4K transcode slow/OOM ho sakta hai. |
| Disk | Free plans me disk nahi/limited: files restart par ja sakti hain (`FILE_TTL_HOURS` chhota rakho). |
| Sleep | Render free 15 min baad sota hai; first request slow. |
| Bandwidth | Cloudflare tunnel free hai par tumhare ghar ki upload speed par depend karta hai. |

## Sabse chhota summary

1. **Code GitHub pe push hai** — kuch aur karne ki zarurat nahi, repo clone/redeploy
   se latest chahiye.
2. **Free me live karne ka best tarika:** apne PC pe `npm start` + `npx -y cloudflared
   tunnel --url http://localhost:8080` → turant public HTTPS link.
3. **24×7 free URL chahiye:** Render pe Blueprint deploy (file ready hai) — demo/UI
   ke liye perfect, asli downloads IP block ki wajah se kabhi kabhi fail.
4. **Asli 4K + no sleep:** paid VPS ₹300–500/month, ya Oracle Always Free VM.

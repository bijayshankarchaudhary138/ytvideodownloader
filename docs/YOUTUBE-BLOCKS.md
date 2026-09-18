# "YouTube block karta hai" — asli baat kya hai

Tumne poocha: *"agar YouTube block karta hai to hamari website kaam kaise karegi,
aur competitors ki kyu kaam kar rahi hai?"* Yahan pura sach hai.

## 1. YouTube "website" ko block nahi karta — **IP / behaviour** ko dekhta hai

YouTube ke paas koi list nahi hai ki "ytvideodownloader.com blocked hai". Wo har
**request** ko dekhta hai:

| Signal | Kya hota hai |
| --- | --- |
| **IP address ka type** | Datacenter/cloud IP (AWS, Render, Hetzner, GCP) par YouTube sakht hai. Ghar/mobile ka residential IP aasan. |
| **Request pattern** | Ek IP se 1 minute me 200 downloads = bot. Roz 1000 users ke 5000 requests = normal. |
| **Bot signatures** | Purane yt-dlp versions, missing headers/browser signals |
| **Login cookies** | Cookies ke saath YouTube tumhe "logged-in browser" maanta hai |
| **Video restrictions** | Age-restricted, region-locked, member-only — in par har IP par error aata hai |

Isliye **ek hi site kabhi kabhi chalti hai aur kabhi nahi** — kyunki block site ka
nahi, uske server ke IP ka hai. Iska matlab:

> **Tumhar apne PC / ghar ke internet pe ye app kaam karegi, kyunki YouTube ghar
> ke IP ko block nahi karta.** Sandbox (aur Render jaise cloud) ke IP datacenter
> hone ki wajah se block hote hain.

## 2. Competitors kyu chalte hain? (3 sach)

### (a) Unke paas IP pool / proxies hote hain

y2mate, SaveFrom jaisi sites **hundreds of servers + residential proxy pools**
chalati hain. Ek IP block hote hi request dusre IP se jaati hai. Ye mahanga hai —
isi liye unki site par itne ads hote hain. Hum (self-hosted, ad-free) ye cost nahi
uthate.

### (b) Unka "download" browser me hota hai (sabse bada raaz)

Bahut si sites aisa karti hain:

1. Server par sirf **metadata + direct video URL** nikalte hain (ye ek chhota request hai),
2. aur asli video **browser seedha `googlevideo.com` se** download karta hai — matlab
   **tumhare (user ke) IP se**, unke server se nahi.

Isse unka server IP kabhi "download" nahi karta, isliye block nahi hota. Lekin
iska cost bhi hai: **video aur audio merge nahi hota** (browser me ffmpeg nahi hai)
— isi liye wo sites sirf 360p/720p combined stream deti hain. 1080p chahiye to
"Pro" maangti hain.

**Hamara app ulta trade-off leta hai:** server par ffmpeg hai, isliye 4K/1080p
**audio ke saath merged** milta hai — par download server ke IP se hota hai. Isliye
ghar ke IP pe best kaam karta hai.

### (c) Wo bhi block hote rehte hain — aur band bhi ho jate hain

- **y2mate Oct 2025 me copyright takedown ke baad band ho gaya**
- YT1s, SaveFrom jaise sites roz "unable to download" errors deti hain
- Bahut si sites domain badalti rehti hain (yt1s → yt1s.cc → y2mate → …)
- Google unhe regular interval me de-index bhi karta hai

Matlab competitor bhi magic nahi hai — wo bas **paisa aur infra** lagate hain.

## 3. Phir hamari website kaise chalegi? (4 levers, sab already built-in)

Ye setting ke naam hain — koi code change nahi:

| Lever | Kaise | Kab use karo |
| --- | --- | --- |
| **Ghar ka IP** (sabse asaan) | Apne PC pe `npm start` + `npx -y cloudflared tunnel --url http://localhost:8080` | Hamesha — best success rate |
| **Cookies** | `COOKIES_FILE=/path/cookies.txt` (browser se Netscape format export) | Age-restricted / "sign in to confirm you're not a bot" |
| **Proxy** | `PROXY_URL=http://user:pass@host:port` (residential best) | Cloud/VPS pe jab bot-check aaye |
| **Extractor args** | `YTDLP_EXTRACTOR_ARGS="youtube:player_client=web_safari,tv"` | Jab YouTube client behaviour badle (ye YouTube ke badlav ke saath badalta rehta hai) |

Aur ek bahut zaroori cheez: **yt-dlp update karke rakho** — YouTube har mahine
kuch badalta hai, aur yt-dlp ki team 1–2 din me fix nikaalti hai:

```bash
# har din apne app ke folder me:
npm run setup -- --skip-ffmpeg      # ya: SKIP_FFMPEG=1 npm run setup
# Docker:
docker compose exec ytvideodownloader sh -c 'SKIP_FFMPEG=1 npm run setup'
```

## 4. Error messages ka matlab (app already ye batati hai)

| Error | Matlab | Kya karo |
| --- | --- | --- |
| `BOT_CHECK` | YouTube ko shak hai ki server bot hai | Cookies ya proxy lagao, ya ghar ke IP pe chalao |
| `GEO_BLOCKED` | Video tumhare server ke region me available nahi | Us region ka proxy lagao |
| `VIDEO_UNAVAILABLE` / `PRIVATE_VIDEO` | Video private/deleted/age-restricted hai | Kuch nahi kar sakte (koi bhi tool nahi kar sakta) |
| `TIMEOUT` | Bada file, dhima server | `CONCURRENCY` badhao, `FFMPEG_PRESET=ultrafast` |
| `DOWNLOAD_FAILED` | Network/connection fail | Retry — resume support built-in hai |
| `RATE_LIMITED` | Tumne (ya kisi ne) bahut requests ki | Thoda ruk kar try karo |

## 5. Render pe kya expect karein (tumhara pehla test)

Render ka IP **datacenter** hai, kyunki wo cloud hai. Isliye:

- **UI, progress, playlists, trim, subtitles, thumbnails, API — sab 100% chalega**
- **Asli YouTube download**: kabhi chalega, kabhi `BOT_CHECK` dega (Render ka IP +
  YouTube ki policy par depend). Ye tumhari website ka bug nahi hai.
- Agar Render pe bot-check aaye to teen raste hain:
  1. `DEMO_MODE=on` kar do → site phir bhi pura chalta rahega (sample media ke saath) —
     UI/features check karne ke liye perfect
  2. `PROXY_URL` daalo (residential proxy) — tab asli downloads bhi chalenge
  3. Apne PC pe tunnel chalao (Option 1) — best success rate, free

## 6. Ek line ka jawab

> YouTube site ko nahi, **IP ko** block karta hai. Competitors IP pools aur
> browser-side download se bachte hain (isliye unme 1080p+audio nahi milta, aur
> wo band bhi ho jate hain). Hum ghar ke IP + cookies + proxy + updated yt-dlp se
> kaam karte hain — aur jahan YouTube rok de wahan app saaf error batati hai,
> chupke se fail nahi hoti.

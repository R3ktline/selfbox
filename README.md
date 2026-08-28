# Selfbox

**A self-hosted, local-first toolbox in your browser.** Compress images, edit PDFs, generate QR codes, format JSON, and more — without sending files to a third-party service.

Everything runs on **your machine**. Files stay on your device unless you explicitly download or export them.

---

## Highlights

- **Private by default** — image, PDF, and dev tools process data entirely in the browser
- **No account required** — open the app and start working
- **Hash-based routing** — deploy as a static site; no server-side URL rewriting needed
- **Dark & light themes** — follows system preference or manual toggle
- **30+ tools** across design, image, PDF, dev, and media workflows

---

## Requirements

| | Minimum | Recommended |
|---|---|---|
| **Node.js** | 20.x | 22.x LTS |
| **npm** | 10.x | latest |
| **Browser** | Chrome 120+, Firefox 120+, Safari 17+, Edge 120+ | latest stable |

### Browser APIs used

Most tools need a modern browser with:

- Canvas 2D & WebGL (image editing, QR, screenshots)
- `Web Crypto` (hashing, UUIDs)
- `File` / `Blob` / `ArrayBuffer` (uploads & exports)
- `localStorage` (theme, QR presets, custom spell-check words)
- Web Workers (image compression, OCR)

**Safari / iOS:** HEIC conversion and some PDF features may be slower on first load. Large PDFs (>100 pages) can be memory-intensive on mobile.

---

## Quick start (development)

```bash
git clone https://github.com/R3ktline/selfbox.git
cd selfbox
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

```bash
npm run build    # production build → dist/
npm run preview  # serve dist/ locally (port 4173)
npm run lint     # oxlint
```

---

## Deploy on your server

Selfbox is a **static SPA** after `npm run build`. The `dist/` folder can be served by any web server.

### 1. Build

On your build machine or server:

```bash
npm ci
npm run build
```

Upload the contents of `dist/` to your web root.

### 2. Nginx (recommended)

```nginx
server {
    listen 80;
    server_name toolbox.example.com;
    root /var/www/selfbox;
    index index.html;

    # Hash routing (#/path) — only index.html is required at /
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache hashed assets aggressively
    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Optional: gzip
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
}
```

Enable HTTPS with [Certbot](https://certbot.eff.org/) or your provider's TLS certificate.

### 3. Apache

```apache
<VirtualHost *:80>
    ServerName toolbox.example.com
    DocumentRoot /var/www/selfbox

    <Directory /var/www/selfbox>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>
</VirtualHost>
```

Use `.htaccess` if needed:

```apache
RewriteEngine On
RewriteBase /
RewriteRule ^index\.html$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.html [L]
```

### 4. Docker (static)

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
```

```bash
docker build -t selfbox .
docker run -d -p 8080:80 selfbox
```

### 5. GitHub Pages / Cloudflare Pages / Netlify

- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Node version:** 20 or 22

No environment variables are required for the static tools.

---

## Media Downloader (optional server component)

The **Media Downloader** tool (`#/media`) calls a small Node API bundled with the Vite dev/preview server. It is **not** included in a plain static `dist/` deploy.

To use it in production, run the preview server (or an equivalent Node host) instead of only nginx static files:

```bash
npm run build
npm run preview -- --host 0.0.0.0 --port 4173
```

### Extra dependencies (host machine)

| Tool | Purpose | Install |
|---|---|---|
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | YouTube, X/Twitter, SoundCloud | `pip install yt-dlp` or system package |
| [FFmpeg](https://ffmpeg.org/) | Audio/video muxing | `apt install ffmpeg` / `brew install ffmpeg` |
| [spotDL](https://github.com/spotDL/spotify-downloader) | Spotify tracks | `pip install spotdl` |
| Deno (optional) | Some yt-dlp extractors | [deno.land](https://deno.land/) |

Ensure `yt-dlp`, `ffmpeg`, and `spotdl` are on the server `PATH`. The app probes availability on first use.

> **Note:** Downloading copyrighted content may violate platform terms or local law. Run this only on infrastructure you control and for content you have the right to access.

---

## Tools

### Design
| Tool | Description |
|---|---|
| QR Code Generator | Styled QR codes, logos, batch export, presets |
| Color Palette | Extract palettes from images (HEX, RGB, CSS vars) |
| Unit & Color Converter | px/rem/vw, color spaces, WCAG contrast |

### Image
| Tool | Description |
|---|---|
| Background Remover | Remove solid-color backgrounds → transparent PNG |
| Image Compressor | Target file size, format conversion |
| Format Converter | HEIC/HEIF → PNG, JPEG, WebP |
| Resize & Crop | Resize and crop with live preview |
| Screenshot Beautifier | Frames, shadows, aspect-ratio mockups |

### PDF
| Tool | Description |
|---|---|
| Page Editor | Merge, reorder, rotate, delete pages |
| Split & Export | Split pages, export as images (ZIP) |
| Images to PDF | Combine images into one PDF |
| Text Extract | Native text + OCR fallback (Tesseract.js) |
| Optimize | Compress image-heavy PDFs, add watermark |

### Dev
| Tool | Description |
|---|---|
| Markdown Export | GFM → PDF or PNG with syntax highlighting |
| JSON / CSV Formatter | Pretty-print, tree view, delimiter detection |
| Text Diff | Line/word diff, side-by-side, patch export |
| Base64 | Encode/decode text, hex, images, files |
| Regex Tester | Live match highlighting and replace preview |
| Hash & UUID | SHA-256/512, UUID v4, nanoid |
| Text Tools | Word count, find/replace, case/slug, spell check |
| Favicon Generator | Multi-size PNGs, ICO, web manifest |

### Media
| Tool | Description |
|---|---|
| Media Downloader | YouTube, X, SoundCloud, Spotify (requires server) |
| GIF Tools | Split frames, preview, build GIF from images |
| Image Editor | Crop, blackout redaction, text labels |

---

## Privacy & data handling

- **No analytics or tracking** is built into the app
- **No uploads** — processing happens in-memory in your browser tab
- **Spell check** loads `public/dict/en.aff` and `en.dic` from your own server (not a CDN)
- **QR presets / theme** are stored in `localStorage` on the client only
- **Media Downloader** fetches URLs server-side via yt-dlp/spotDL on **your** host

---

## Known limitations

- Background removal works best on uniform backgrounds (white/green screen); complex scenes are approximate
- Very large images (>40 MP) or PDFs (100+ pages) may hit browser memory limits
- OCR quality depends on scan resolution; English dictionary only for spell check
- HEIC support loads a ~1.3 MB WASM chunk on first use
- Media Downloader requires the Node preview server and external CLI tools

---

## Project structure

```
selfbox/
├── public/          # Static assets, spell-check dictionaries
├── server/          # Media download API (Vite middleware)
├── src/
│   ├── components/  # Shared UI
│   ├── lib/         # Utilities, router, tool registry
│   └── pages/       # One module per tool
├── dist/            # Production output (after npm run build)
└── vite.config.ts
```

---

## Tech stack

- [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Vite 8](https://vite.dev/) with Rolldown bundling
- [pdf-lib](https://pdf-lib.js.org/) & [pdf.js](https://mozilla.github.io/pdf.js/) for PDF work
- [qr-code-styling](https://github.com/kozakdenys/qr-code-styling) for QR codes
- [Tesseract.js](https://tesseract.projectnaptha.com/) for OCR
- [typo-js](https://github.com/cfinke/Typo.js) for spell checking
- [heic2any](https://github.com/alexcorvi/heic2any) for iPhone photos

---

## Contributing

Issues and pull requests are welcome on [GitHub](https://github.com/R3ktline/selfbox).

---

## License

This project is provided as-is for personal and self-hosted use. Add a `LICENSE` file if you redistribute a fork.

# Lark

Turn a hum into editable MIDI in Audiotool Studio.

**Prerequisites**

1. Clone the repository
2. `npm install`
3. Copy `.env.example` → `.env.local` and set `VITE_AUDIOTOOL_CLIENT_ID`
4. `npm run dev` and open `http://127.0.0.1:5173/` (not `localhost`)

Minimum env for the transform flow:

```
VITE_AUDIOTOOL_CLIENT_ID=your_audiotool_client_id
VITE_AUDIOTOOL_REDIRECT_URL=http://127.0.0.1:5173/
```

**Audiotool login** ([docs](https://developer.audiotool.com/js-package-documentation/documents/Authentication.html)):

| Requirement | Lark setup |
|-------------|------------|
| Dev server host | `vite.config.js` → `host: '127.0.0.1'`, `port: 5173` |
| Open in browser | `http://127.0.0.1:5173/` (not `localhost`) |
| Redirect URI (portal + `.env.local`) | `http://127.0.0.1:5173/` (trailing slash required) |
| Redirect URI (GitHub Pages) | `https://<your-github-user>.github.io/lark/` — **must** be added in [Audiotool developer portal](https://developer.audiotool.com/applications) alongside the local URI |
| GitHub Pages secrets | Repo → Settings → Secrets → `VITE_AUDIOTOOL_CLIENT_ID` |
| Scope (portal + app) | `project:write sample:write` (sample:write required for Mood layers import) |
| Login button | Calls `at.login()` from `audiotool()` per docs |

**Delete project:** Requires `project:write` on your [developer app](https://developer.audiotool.com/applications) and a fresh login after changing scopes. If you see `permission_denied` / gRPC code 7, delete the project at [audiotool.com/projects](https://www.audiotool.com/projects) instead (published tracks must be removed on Audiotool first).

**Humming → instrument flow**

1. Record humming in **Audio Capture**
2. Sign in to **Audiotool** and pick a **Connected project** (dropdown in Parameter Matrix), or **New Project**
3. Pick **lead instrument** and optional **Studio layers** (pad, bass, arp, etc.)
4. Click **Transform humming → instrument** — Lark transcribes your hum and writes MIDI in that project (lead + any selected layers)
5. Open the project in **Audiotool Studio** and press play from bar 1; use **Save Project** to persist metadata

**Nexus SDK map (what Lark writes)**

| Step | SDK call | Studio result |
|------|----------|---------------|
| Open project | `at.open(studioUrl)` + `doc.start()` | Project synced |
| Rhythm | Web Audio onset detection (local) | — |
| Device | Lead: `gakki`, `bassline`, `beatbox8` · Layers: `space`, `heisenberg`, `matrixArpeggiator`, `beatbox9`, … | One or more instruments on desktop |
| Timeline | `noteTrack` → `noteRegion` → `note` × N | Green MIDI clip (e.g. "Lark · Piano · Calm") |
| Hear it | `desktopAudioCable` device → `mixerChannel` on **Master** | Cable on stagebox |

Code: `src/lib/nexus-rhythm-notes.js`, `src/lib/nexus-mixer-routing.js`

**GitHub Pages**

URL: `https://<your-github-user>.github.io/lark/`

Pushes to `main` run `.github/workflows/deploy-pages.yml`, which builds `dist/` and deploys via GitHub Actions Pages.

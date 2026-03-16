# Digital Twin Teaching Assistant

A full-stack AI teaching platform that lets a professor deploy a personal digital twin avatar for 1:1 student tutoring. The avatar delivers lectures, answers questions from uploaded course notes (RAG), and adapts to student engagement in real time.

**Live site:** https://askchris.guru

---

## Features

- **AI Avatar** — Tavus CVI video avatar of the professor (replica: `ra9c9bba2ccc`, phoenix-4 model)
- **RAG Knowledge Base** — Upload course notes (PDF, DOCX, TXT); ChromaDB + OpenAI embeddings answer topic-specific questions
- **Lecture Mode** — Generate a GPT-4o lecture script from uploaded notes and prime the avatar with it
- **Emotion Detection** — MediaPipe FaceLandmarker in the browser streams student facial expressions via WebSocket; the LLM adapts its tone accordingly
- **Mobile Support** — On Android/iOS the session opens in a native browser tab for proper microphone access

---

## Architecture

```
Browser (React + Vite)
    │
    ├── HTTPS (nginx) ──► FastAPI backend (uvicorn, port 8000)
    │                         ├── /api/conversations  → Tavus CVI
    │                         ├── /api/llm            → GPT-4o (custom LLM webhook)
    │                         ├── /api/notes/*        → ChromaDB RAG ingest
    │                         └── /ws/emotion/{id}    → WebSocket emotion stream
    │
    └── iframe ──► https://tavus.daily.co/{conversation_id}
```

**Server:** DigitalOcean Ubuntu 24.04, IP `143.198.228.58`
**Domain:** `askchris.guru` (HTTPS via Let's Encrypt, auto-renews)

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite |
| Backend | FastAPI, uvicorn, Python 3.12 |
| Avatar | Tavus CVI (phoenix-4 replica) |
| LLM | OpenAI GPT-4o |
| RAG | ChromaDB (local), `text-embedding-3-small` |
| Emotion | MediaPipe FaceLandmarker (browser) |
| Server | nginx, systemd, DigitalOcean |
| SSL | Let's Encrypt (certbot, auto-renews) |

---

## Project Structure

```
DIGITAL_TWIN/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI routes
│   │   ├── rag.py           # ChromaDB RAG system
│   │   ├── tavus_client.py  # Tavus API client
│   │   └── models.py        # Pydantic request/response models
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── api/client.js            # API calls to backend
│   │   ├── components/
│   │   │   ├── AvatarSession.jsx    # Main session UI (desktop + mobile)
│   │   │   ├── EmotionDetector.jsx  # MediaPipe face detection
│   │   │   └── NotesManager.jsx     # Upload/manage course notes
│   │   └── hooks/
│   │       └── useEmotionDetection.js
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── nginx/
│   └── default.conf         # nginx config (HTTP → HTTPS redirect, API proxy)
├── config/
│   └── professor_context.txt  # Avatar persona, topics, tone — edit this to customise
├── scripts/
│   ├── deploy.py            # Paramiko-based deploy script
│   ├── server_setup.sh      # One-time server provisioning
│   └── setup_https.sh       # Run once after DNS propagates to enable SSL
├── .env.example             # API key template
├── .gitignore               # Excludes .env, node_modules, dist, __pycache__
└── README.md
```

---

## Running the Deploy Script (Windows / PowerShell)

Open **PowerShell** and run:

```powershell
cd C:\Users\westl\Documents\GitHub\DIGITAL_TWIN
python scripts\deploy.py
```

> **First time only** — install the required Python library:
> ```powershell
> pip install paramiko
> ```

The script will SSH into the server, upload all files, build the frontend, and restart the backend automatically. It takes about 60–90 seconds.

---

## Customising the Avatar (professor_context.txt)

Open `config\professor_context.txt` in any text editor (Notepad, VS Code, etc.) and edit the sections below. Lines starting with `#` are comments and are ignored.

### Sections

**`IDENTITY:`**
Who the avatar is. Write in second person ("You are..."). Include background, expertise, and how the avatar should introduce itself.

```
IDENTITY:
You are Professor J Christopher Westland, a professor at UIC specialising in
Information Systems. You are patient, rigorous, and use real-world examples.
```

**`ALLOWED_TOPICS:`**
Bullet list of topics the avatar will engage with fully. Be as specific or broad as you like.

```
ALLOWED_TOPICS:
- Information systems and technology management
- Financial accounting and auditing
- Statistics and quantitative methods
```

**`RESTRICTED_TOPICS:`**
Bullet list of topics the avatar will politely decline. It will redirect the student back to coursework.

```
RESTRICTED_TOPICS:
- Personal or romantic advice
- Medical or legal advice
- Academic dishonesty or plagiarism
```

**`TONE:`**
Instructions for communication style — how formal, how to handle confused students, how to redirect off-topic questions.

```
TONE:
- Conversational, like office hours
- If a student seems confused, slow down and use an analogy
- If off-topic: "That's outside what I can help with — let's get back to [topic]."
```

**`COURSE_CONTEXT:`**
Current semester details, course codes, office hours, or any timely information.

```
COURSE_CONTEXT:
Current courses: IS 572, IS 451
Semester: Spring 2026
Office hours: By appointment — westland@uic.edu
```

### Applying your changes

After editing the file, deploy from PowerShell:

```powershell
cd C:\Users\westl\Documents\GitHub\DIGITAL_TWIN
python scripts\deploy.py
```

The new context takes effect immediately after the backend restarts (happens automatically during deploy).

---

## Quick Deploy

### Prerequisites

- Python 3.x with `paramiko` installed (`pip install paramiko`)
- Node.js 20+ (for local frontend builds)
- API keys: OpenAI, Tavus

### 1. Configure environment

Copy `.env.example` to `.env` and fill in:

| Variable | Value |
|----------|-------|
| `OPENAI_API_KEY` | From platform.openai.com |
| `TAVUS_API_KEY` | From platform.tavus.io |
| `TAVUS_REPLICA_ID` | Your replica ID from Tavus |
| `PROFESSOR_NAME` | Your name |
| `SERVER_URL` | `https://askchris.guru` |

### 2. Deploy to server (PowerShell)

```powershell
cd C:\Users\westl\Documents\GitHub\DIGITAL_TWIN
python scripts\deploy.py
```

### 3. First-time HTTPS setup (run once after DNS propagates)

Point your domain's A record at `143.198.228.58`, wait for DNS propagation, then run from PowerShell:

```powershell
ssh root@143.198.228.58 "certbot --nginx -d askchris.guru -d www.askchris.guru --non-interactive --agree-tos --email admin@askchris.guru --redirect"
```

> **Note:** The deploy script skips the nginx config after SSL is set up, so redeploying will never break HTTPS.

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check, RAG chunk count, topics |
| GET | `/api/replicas` | List Tavus replicas |
| GET | `/api/personas` | List Tavus personas |
| POST | `/api/persona` | Create/update teaching persona |
| POST | `/api/conversations` | Start a CVI session → returns `conversation_url` |
| DELETE | `/api/conversations/{id}` | End a session |
| POST | `/api/llm` | Custom LLM webhook (called by Tavus) |
| POST | `/api/notes` | Ingest plain-text notes |
| POST | `/api/notes/file` | Upload PDF / DOCX / TXT |
| GET | `/api/notes/topics` | List ingested topics |
| DELETE | `/api/notes/{topic}` | Delete a topic |
| POST | `/api/lecture/script` | Generate a GPT-4o lecture script |
| WS | `/ws/emotion/{session_id}` | Stream emotion data from browser |

Full interactive docs: https://askchris.guru/api/docs

---

## Server Management

```bash
# SSH in
ssh root@143.198.228.58

# Check backend status
systemctl status digital-twin

# View live logs
tail -f /opt/digital-twin/logs/backend.log

# Restart backend
systemctl restart digital-twin

# Reload nginx (after config changes)
systemctl reload nginx
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key |
| `TAVUS_API_KEY` | Yes | Tavus API key |
| `TAVUS_REPLICA_ID` | Yes | Your trained digital twin replica ID |
| `TAVUS_PERSONA_ID` | No | Auto-set by the app on first session |
| `PROFESSOR_NAME` | Yes | Name shown in the avatar's system prompt |
| `SERVER_URL` | Yes | Public URL of the server (e.g. `https://askchris.guru`) |
| `CHROMA_DIR` | No | ChromaDB persistence path (default: `./data/chroma`) |
| `AUTO_CLEAN_NOTES` | No | Use GPT-4o-mini to clean notes on upload (default: `false`) |

---

## Notes

- The Tavus avatar auto-creates a persona on the first session after each server restart. This is cached in memory for the lifetime of the process.
- `custom_llm_url` is not supported by Tavus v2 API on either personas or conversations — the avatar uses Tavus's built-in LLM guided by the system prompt.
- SSL certificate auto-renews via certbot's systemd timer. Expiry: 2026-06-14.

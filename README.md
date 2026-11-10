# MeetUp Video – Full Stack Mobile App

A complete video chat app for meeting new people. Includes:

- Registration (18+)
- Random matching with filters (gender preference + interests)
- WebRTC video calls
- Report & Block
- Next person
- Backend matching server (Socket.io)
- Ready to wrap as a native mobile app with Capacitor

## Quick Start (Web)

```bash
cd meetup-full
npm install
npm start
```

Open http://localhost:3000 on your computer, then open the same URL on your phone (or use two browser windows) to test matching.

## Features Implemented

| Feature              | Status |
|----------------------|--------|
| Registration         | ✅     |
| Age gate (18+)       | ✅     |
| Gender + preference  | ✅     |
| Interests matching   | ✅     |
| Random video matching| ✅     |
| Next person          | ✅     |
| Mute / Camera toggle | ✅     |
| Report               | ✅     |
| Block                | ✅     |
| Mobile-first UI      | ✅     |
| PWA ready            | ✅     |

## Turning it into a Real Mobile App (Capacitor)

1. Install Capacitor:

```bash
npm install @capacitor/core @capacitor/cli
npx cap init
```

2. Add platforms:

```bash
npm install @capacitor/android @capacitor/ios
npx cap add android
npx cap add ios
```

3. Build & open:

```bash
npx cap sync
npx cap open android   # or ios
```

4. For camera permissions, add to `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
```

5. For iOS, add to `Info.plist`:

```xml
<key>NSCameraUsageDescription</key>
<string>MeetUp needs camera access for video calls</string>
<key>NSMicrophoneUsageDescription</key>
<string>MeetUp needs microphone access for video calls</string>
```

## Adding a Real Database (Production)

The app now supports **PostgreSQL** + **Redis**.

### What each database does

| Database   | Purpose                                      |
|------------|----------------------------------------------|
| PostgreSQL | Users, reports, blocks (persistent)          |
| Redis      | Matching queue, active calls, temporary data |

### Setup on Railway (recommended)

1. In your Railway project, click **+ New** → **Database** → **PostgreSQL**.
2. Click **+ New** → **Database** → **Redis**.
3. Railway automatically injects:
   - `DATABASE_URL`
   - `REDIS_URL`
4. Redeploy the app. It will create the tables automatically on startup.

### Setup on Render

1. Create a **PostgreSQL** database.
2. Create a **Redis** instance (or use Upstash free Redis).
3. Add these environment variables to your web service:
   - `DATABASE_URL` = the Postgres connection string
   - `REDIS_URL` = the Redis connection string
4. Redeploy.

### Local development

```bash
# Start Postgres and Redis with Docker (optional)
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=pass postgres
docker run -d -p 6379:6379 redis

# Then set environment variables
export DATABASE_URL=postgres://postgres:pass@localhost:5432/postgres
export REDIS_URL=redis://localhost:6379
npm start
```

### Environment Variables

| Variable       | Required | Description                    |
|----------------|----------|--------------------------------|
| `DATABASE_URL` | Yes      | PostgreSQL connection string   |
| `REDIS_URL`    | Yes      | Redis connection string        |
| `PORT`         | No       | Set automatically by most hosts|

The server creates the required tables (`users`, `reports`, `blocks`) automatically when it starts.

## How to Host on a Real Server

### Option 1: Railway (Easiest – Recommended)

1. Push the project to a GitHub repository.
2. Go to [railway.app](https://railway.app) and sign up (free tier available).
3. Click **New Project → Deploy from GitHub repo**.
4. Select your repo.
5. Railway will auto-detect Node.js. It uses the `start` script.
6. Once deployed, you’ll get a public URL like `https://your-app.up.railway.app`.
7. Open that URL on multiple devices to test matching.

**Environment variables** (optional for later):
- `PORT` is automatically set by Railway.

### Option 2: Render

1. Push to GitHub.
2. Go to [render.com](https://render.com) → New → Web Service.
3. Connect the repo.
4. Settings:
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Deploy. You’ll get a `*.onrender.com` URL.

### Option 3: Fly.io

```bash
# Install flyctl, then:
fly launch
fly deploy
```

### Option 4: VPS (DigitalOcean, Linode, Hetzner, etc.)

1. Create a Ubuntu server.
2. Install Node.js 20+.
3. Clone the repo and run:

```bash
npm install
npm install -g pm2
pm2 start server.js --name meetup
pm2 save
pm2 startup
```

4. Put Nginx in front for HTTPS (use Certbot).

### Important Notes for Production

- **HTTPS is required** for camera/microphone access on mobile browsers.
- The current matching is in-memory. If the server restarts, the queue resets. For real use, add Redis or a database.
- Free tiers on Railway/Render may sleep after inactivity. Paid plans stay always-on.
- For better video connectivity, add a TURN server later (e.g. Twilio or self-hosted coturn).

After deploying, share the public URL with others and they can register and start matching.

## Project Structure

```
meetup-full/
├── server.js              # Matching + signaling server
├── public/                # Frontend (served by Express)
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   └── manifest.json
├── capacitor.config.json
└── package.json
```

Enjoy! 🚀
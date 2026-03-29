# Alpha fixes summary

## What was fixed

### 1) Upload/media URLs
- Backend now returns relative upload paths (`/uploads/<file>`) instead of building absolute URLs from request host.
- Frontend API proxy normalizes old/stale media URLs that may still be stored in the database like `http://backend:4000/uploads/...` into same-origin `/uploads/...`.
- Realtime socket message payloads are normalized the same way, so newly received messages also resolve correctly.
- Alpha nginx now proxies `/uploads/` directly to backend for faster static media delivery.

### 2) Camera / microphone permission UX
- Added a shared media permission helper with clear error messages.
- Before starting or rejoining a call, the app now proactively asks for microphone access and also attempts to request camera access.
- Audio recorder now shows the real reason when media access fails.
- Video note recording now shows a visible message instead of failing silently.

## Important deployment note
Browser camera/microphone prompts require a **secure context**. In practice that means:
- `https://your-domain/...`, or
- `http://localhost/...`

If alpha is opened over a raw public IP on plain HTTP, browsers can block `getUserMedia()` entirely and no permission prompt will appear.

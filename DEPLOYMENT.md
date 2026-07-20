# EPISTEME — Deployment (Vercel)

## Steps

1. **Connect the repository**: in the [Vercel dashboard](https://vercel.com/new),
   import the `episteme-web` GitHub repository. Vercel auto-detects Next.js —
   the default build settings (`npm run build`) are correct as-is.
2. **Set the environment variable**: in *Project → Settings → Environment
   Variables*, add `GROQ_API_KEY` (Production + Preview) — a free-tier key
   from the Groq Console (https://console.groq.com; no card, no EU
   restriction — the route calls the `llama-3.3-70b-versatile` model via
   Groq's OpenAI-compatible API). This is the only required variable; it is
   read server-side by `src/app/api/chat/route.ts` and must never be
   prefixed with `NEXT_PUBLIC_`.
3. **Deploy**: trigger the first deployment. Every push to the connected
   branch redeploys automatically.

## Notes

- **EmailJS**: the service ID, template ID and public key currently live as
  client-side constants in `src/components/ReservationSection.tsx`, matching
  the already-configured EmailJS account (recipient is set in the EmailJS
  template dashboard). EmailJS public keys are meant to be browser-visible;
  migrating them to `NEXT_PUBLIC_*` env vars is a nice-to-have, not a blocker.
- **Booking store**: availability/booking state is an in-memory, per-server
  session simulation (see the seam comment in `src/lib/booking.ts`). On
  serverless it resets per instance — swap in a real database before taking
  real reservations.
- **Images**: source PNGs in `public/images/` are uncompressed originals
  (~32 MB). `next/image` serves optimized AVIF/WebP at runtime, but a TinyPNG
  pass on the sources is still recommended to slim the repository and origin
  responses.

# EPISTEME — Retell AI voice agent beállítás

A voice agent a Retell felhőjében fut (dashboard.retellai.com), de a foglalási
műveleteket a saját szerverünk hajtja végre a `/api/retell/functions`
végponton át — ugyanazzal a foglalómotorral (`src/lib/booking.ts`), mint a
weboldal chat-recepciósa. A megerősítő kódot (EP-XXXX) kizárólag a szerver
generálja; az agent csak visszamondja.

## 0. Előfeltétel — Vercel env változó

A Vercelen (Project → Settings → Environment Variables) vedd fel:

```
RETELL_FUNCTION_SECRET=<hosszú véletlen string, pl. 32+ karakter>
```

majd redeploy. Enélkül a végpont 503-mal elutasít mindent (szándékosan —
foglalást módosító végpont nem lehet nyitva).

## 1. Agent létrehozása

Dashboard → **Create Agent** → *Single-Prompt Agent* (Retell-hosted LLM).

- **Voice**: válassz ElevenLabs *multilingual* hangot (a magyarhoz ez kell) —
  hallgasd meg a mintákat, és egy nyugodt, elegáns hangot válassz.
- **Language**: ha van "Multi-language" / "hu" opció az STT-nél, kapcsold be a
  magyart; az agent alapból magyarul köszön, de EN/ES vendégekkel vált.
- **Model**: a legerősebb elérhető (pl. GPT-4.1 / Claude) — a foglalási
  folyamat több lépéses, megéri.

## 2. Prompt (másold be az agent promptjába)

```
You are the telephone receptionist of EPISTEME, an ultra-luxury fine-dining
restaurant in Budapest, Kossuth Lajos tér 14. You speak on a live voice call:
keep every reply SHORT (1-3 sentences), calm and gracious — a maître d's
tone. Never read out lists longer than 3 items at once.

LANGUAGE: Greet in Hungarian and default to Hungarian. If the guest speaks
English or Spanish, switch fully. Formal address is mandatory in every
language: Hungarian magázódás ("Ön"), Spanish "usted", courteous formal
English. Never switch to informal.

RESTAURANT FACTS:
- Address: Budapest, Kossuth Lajos tér 14 (Danube bank, opposite Parliament).
- Hours: Mon-Fri 20:00-00:00, Sat-Sun 20:00-01:00; last seating one hour
  before closing (Mon-Fri 23:00, Sat-Sun 00:00).
- Capacity 50 guests. Spaces: street terrace, rooftop bar, indoor dining room.
- Deposit: 275,59 € per reservation. NO minimum spend, NO dress code, anyone
  may book. Contact e-mail: bizniszpappa@gmail.com.
- Kitchen: Executive Chef Julien Marchand; Sous-Chef Szabó Máté; Chef
  Sommelier Margaux Fournier; Maître d'hôtel Alessandro De Luca.
- Menu highlights if asked (say prices only when asked): A5 Wagyu
  Chateaubriand in gold crust 1800 €, Matsusaka sirloin 2200 €, blue lobster
  with saffron risotto 1200 €, caviar with blini 15 000 € / 50 g, bird's nest
  soup 600 €, Golden Opulence sundae 1000 €; rare waters, teas, champagnes
  (up to Armand de Brignac Midas 250 000 €), wines (Château d'Yquem 1811
  100 000 €), spirits (Macallan 1926 50 000 €). For anything else on the
  menu, offer to describe a category rather than reciting everything.

BOOKING FLOW (follow strictly, in order):
1. Collect: date, time, party size. Convert natural dates ("holnap", "next
   Saturday") to YYYY-MM-DD; times to HH:MM (24h). Confirm what you heard.
2. Call check_availability. If unavailable, offer the returned
   suggestedAlternatives (read at most 2-3, speak dates/times naturally).
3. Collect the guest's full name and phone number. Read the phone number
   back digit by digit to confirm.
4. State the 275,59 € deposit and ask for final confirmation of all details.
5. Only after the guest confirms, call book_table.
6. Read the confirmation code from the result SLOWLY, character by character
   (e.g. "E, P, kötőjel, nulla, négy, egy, hét"), and repeat it once.

ABSOLUTE RULES:
- NEVER invent availability or a confirmation code. Codes exist only in
  book_table results. If a tool call fails, apologise and offer to try again.
- Stay in the restaurant/reservation domain; politely decline anything else.
- Do not mention that you are an AI unless directly asked; answer honestly
  if asked.
```

## 3. Custom Functions (kettőt vegyél fel)

Mindkettőnél:
- **URL**: `https://episteme-web-phi.vercel.app/api/retell/functions?secret=IDE_A_SECRET`
  (ugyanaz a secret, mint a Vercel env-ben) — vagy ha a dashboard enged
  egyedi fejlécet, `x-retell-secret: <secret>` fejléccel a query param helyett.
- **speak during execution**: be (pl. „Egy pillanat, ellenőrzöm…").

**1) check_availability** — description: "Check table availability for a
given date, time and party size. Always call this before booking."

```json
{
  "type": "object",
  "properties": {
    "date":   { "type": "string", "description": "Reservation date, YYYY-MM-DD" },
    "time":   { "type": "string", "description": "Seating time, HH:MM, 24-hour" },
    "guests": { "type": "integer", "description": "Party size" }
  },
  "required": ["date", "time", "guests"]
}
```

**2) book_table** — description: "Commit a reservation after the guest
confirmed all details and the deposit. Returns the confirmation code."

```json
{
  "type": "object",
  "properties": {
    "name":   { "type": "string", "description": "Guest full name" },
    "phone":  { "type": "string", "description": "Guest phone number" },
    "date":   { "type": "string", "description": "Reservation date, YYYY-MM-DD" },
    "time":   { "type": "string", "description": "Seating time, HH:MM, 24-hour" },
    "guests": { "type": "integer", "description": "Party size" }
  },
  "required": ["name", "phone", "date", "time", "guests"]
}
```

## 4. Kipróbálás

A dashboard **Test** gombjával (webes hívás) azonnal tesztelhetsz. Éles
telefonszámhoz: **Phone Numbers** → szám vásárlása/összekötése → agent
hozzárendelése. A függvényhívások a Vercel Logs-ban `[RETELL_DEBUG]` /
`[RETELL_ERROR]` prefixszel látszanak.

## Ismert korlátok

- A foglalástár jelenleg memóriabeli, szerver-példányonkénti szimuláció
  (lásd `src/lib/booking.ts` seam-komment). Két csatorna (web chat + voice)
  mellett az éles használathoz valódi adatbázis kell, különben a
  kapacitás-számláló példányonként eltérhet.
- Az e-mail visszaigazolás (EmailJS) kliensoldali, ezért a telefonos
  foglalásokról jelenleg nem megy e-mail — ha kell, a `bookTable`-be épített
  szerveroldali e-mail (pl. Resend) a következő lépés.

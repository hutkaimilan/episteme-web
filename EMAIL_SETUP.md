# E-mail beállítás — visszaigazoló és lemondási értesítők

Ez a dokumentum lépésről lépésre végigvezet azon, amit **neked** kell elvégezned
az EmailJS felületén ahhoz, hogy a foglalási visszaigazoló és a lemondási
értesítő e-mailek élesben kimenjenek. A kód már készen áll — amíg a lentiek
nincsenek beállítva, a rendszer **nem hibázik**: a foglalás és a lemondás
ugyanúgy működik, csak a levélküldés kimarad, és a szerver logba egy
`[EMAIL_SKIPPED]` sor kerül.

## Miért szerver-oldali?

Az oldalon eddig is volt EmailJS, de a `@emailjs/browser` csomag **kizárólag a
vendég böngészőjében** fut. Ez a két funkcióhoz kevés:

- a **lemondási értesítő** akkor is ki kell menjen, ha a lemondás a Retell
  hangasszisztensen keresztül érkezik — ott nincs böngésző;
- az **étterem példánya** akkor is el kell jusson, ha a vendég közben bezárta
  a fület.

Az EmailJS erre fel van készítve: van REST API-ja, amit szerverről is lehet
hívni, ha a **privát kulcsot** küldjük `accessToken`-ként, és engedélyezve van a
nem-böngészős hozzáférés. Így a meglévő EmailJS fiókod és service-ed marad,
csak a szerver hajtja meg. Nem kell másik szolgáltatóra váltani.

## Miért csak EGY sablon?

Az EmailJS ingyenes csomagja egyetlen sablont enged. Ezért a dashboardban lévő
sablon szándékosan "buta": mindössze három változót renderel —
`{{to_email}}`, `{{subject}}` és `{{message}}`. **Mindkét levél teljes
szövegét a kód állítja össze** (`src/lib/email.ts`,
`renderConfirmationEmail` / `renderCancellationEmail`), a behelyettesített
adatokkal együtt.

Ez egyben előny is: a levelek szövege verziókövetve van, tesztek ellenőrzik, és
a git historyban látszik minden változtatás — nem egy dashboardban él, amit
nem lehet diffelni.

---

## 1. lépés — Privát kulcs kimásolása

1. Nyisd meg: https://dashboard.emailjs.com/admin/account
2. A **General** fülön másold ki a **Public Key** és a **Private Key** értékét.
   (A Public Key valószínűleg már megvan: `bI2mj0KaJZMJnD6Lq`.)

## 2. lépés — Szerver-oldali hívás engedélyezése (KÖTELEZŐ)

1. Ugyanitt válts a **Security** fülre.
2. Kapcsold be: **"Allow EmailJS API for non-browser applications"**.

> Enélkül minden szerverről indított küldés `403 API calls are disabled for
> non-browser applications` hibával áll meg. Ez a leggyakoribb hibaforrás.

## 3. lépés — Az EGY közös sablon beállítása

Nyisd meg: https://dashboard.emailjs.com/admin/templates — használhatod a már
meglévő sablonodat, nem kell újat létrehozni.

Állítsd be a mezőket **pontosan** így:

| Mező          | Érték                |
| ------------- | -------------------- |
| **To Email**  | `{{to_email}}`       |
| **To Name**   | `{{to_name}}`        |
| **Subject**   | `{{subject}}`        |
| **Content**   | `{{message}}`        |

A **Content** mezőben tényleg csak ez az egy változó legyen, más semmi. A
tartalom formázását (sortörések, megszólítás, adatok) a kód végzi.

> **Fontos**: a **To Email** mezőbe `{{to_email}}` kerüljön, ne fix cím! A kód
> innen irányítja a levelet hol a vendégnek, hol az étteremnek. Ha fix cím
> marad, a lemondási értesítő nem fog eljutni a vendéghez.

Ha a sablon szerkesztője HTML módban van, a sortörések megtartásához tedd a
változót egy `<pre>` blokkba, vagy kapcsold a sablont sima szöveges módra:

```html
<pre style="font-family: inherit; white-space: pre-wrap;">{{message}}</pre>
```

Mentés után másold ki a **Template ID**-t (`template_...`).

### Amit a kód küld

**Foglaláskor** — tárgy: `Foglalás visszaigazolása — EPISTEME`

```
Kedves Kovács Anna!

Köszönjük foglalását az EPISTEME étterembe. Az alábbi részleteket rögzítettük:

Dátum: 2026-07-30
Időpont: 21:00
Létszám: 36 fő
Foglalási kód: EP-1234
Előleg: 275,59 €

Cím: Budapest, Kossuth Lajos tér 14

Kérdés esetén keressen minket: epistemebudapest@gmail.com

Várjuk szeretettel!
EPISTEME
```

**Lemondáskor** — tárgy: `Foglalás lemondva — EPISTEME` (ugyanez a levél megy
a vendégnek ÉS az étteremnek is)

```
Kedves Kovács Anna!

Az alábbi foglalás lemondásra került:

Foglalási kód: EP-1234
Dátum: 2026-07-30
Időpont: 21:00
Létszám: 36 fő

Lemondás időpontja: 2026. 07. 25. 12:00

Amennyiben ez tévedés, kérjük vegye fel velünk a kapcsolatot: epistemebudapest@gmail.com

EPISTEME
```

A szövegek módosításához a `src/lib/email.ts` fájlban a
`renderConfirmationEmail` / `renderCancellationEmail` függvényeket kell
átírni — a dashboardhoz nem kell hozzányúlni.

## 4. lépés — Környezeti változók beállítása

**Vercelben**: Project → Settings → Environment Variables, majd újradeploy.
**Lokálisan**: `.env.local` fájlba.

```
EMAILJS_SERVICE_ID=service_vk94auf
EMAILJS_PUBLIC_KEY=bI2mj0KaJZMJnD6Lq
EMAILJS_PRIVATE_KEY=<az 1. lépésben kimásolt privát kulcs>
EMAILJS_TEMPLATE_ID=<a 3. lépésben beállított sablon Template ID-ja>
```

> A `EMAILJS_PRIVATE_KEY` **titkos** — soha ne kerüljön kliens-oldali kódba és
> ne is `NEXT_PUBLIC_` előtaggal. A kód sosem logolja ki: a hibaüzenetekben
> `[REDACTED_KEY]`-re cseréli.

## 5. lépés — Ellenőrzés

1. Foglalj egy asztalt a chaten keresztül, valós e-mail címmel.
2. Nézd meg a szerver logot (Vercel → Deployment → Runtime Logs):
   - `[EMAIL_SENT] {"label":"booking confirmation", ...}` → sikeres;
   - `[EMAIL_SKIPPED]` → hiányzik valamelyik környezeti változó;
   - `[EMAIL_ERROR]` → az EmailJS utasította el (leggyakrabban a 2. lépés
     maradt ki, vagy rossz a Template ID).
3. Mondd le a foglalást a kóddal, és ellenőrizd, hogy **két** `[EMAIL_SENT]`
   sor jelenik meg: `cancellation notice (guest)` és
   `cancellation notice (restaurant)`.

---

## A régi, kliens-oldali küldés — KIVEZETVE

Korábban a `src/components/ReservationSection.tsx` a böngészőből is küldött
egy levelet foglaláskor, hardcode-olt azonosítókkal (`template_nezbzjh`) és
a régi változónevekkel (`guest_name`, `confirmation_code`, stb.). Ez a sablon
átállítása után üres levelet küldött volna egy fix dashboard-címre, ezért
**eltávolítottuk**: a hívást, a hozzá tartozó függvényt, az `@emailjs/browser`
függőséget és a fölöslegessé vált `reservation.emailFailed` fordításokat is.

Mostantól **minden** levél a szerveroldali, tesztelt úton megy
(`src/lib/email.ts`), és a címzettet mindig a kód adja meg a `{{to_email}}`
paraméterben.

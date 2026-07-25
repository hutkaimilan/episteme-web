# E-mail beállítás — visszaigazoló és lemondási értesítők

Ez a dokumentum lépésről lépésre végigvezet azon, amit **neked** kell elvégezned
az EmailJS felületén ahhoz, hogy a foglalási visszaigazoló és a lemondási
értesítő e-mailek élesben kimenjenek. A kód már készen áll — amíg a lentiek
nincsenek beállítva, a rendszer **nem hibázik**: a foglalás és a lemondás
ugyanúgy működik, csak a levélküldés kimarad, és a szerver logba egy
`[EMAIL_SKIPPED]` sor kerül.

## Miért szerver-oldali?

Az oldalon eddig is volt EmailJS, de a `@emailjs/browser` csomag **kizárólag a
vendég böngészőjében** fut. Ez a mostani két igényhez kevés:

- a **lemondási értesítő** akkor is ki kell menjen, ha a lemondás a Retell
  hangasszisztensen keresztül érkezik — ott nincs böngésző;
- az **étterem példánya** akkor is el kell jusson, ha a vendég közben bezárta
  a fület.

Az EmailJS erre fel van készítve: van REST API-ja, amit szerverről is lehet
hívni, ha a **privát kulcsot** küldjük `accessToken`-ként, és engedélyezve van a
nem-böngészős hozzáférés. Így a meglévő EmailJS fiókod és service-ed marad,
csak a szerver hajtja meg. Nem kell másik szolgáltatóra váltani.

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

## 3. lépés — Két új sablon létrehozása

Nyisd meg: https://dashboard.emailjs.com/admin/templates → **Create New Template**

Mindkét sablonnál **a legfontosabb**: a **To Email** mezőbe `{{to_email}}`
kerüljön (ne fix cím!), mert a kód innen irányítja a levelet a vendégnek,
illetve az étteremnek.

### 3/a — Visszaigazoló sablon (foglaláskor)

- **Név**: pl. `EPISTEME – foglalás visszaigazolása`
- **To Email**: `{{to_email}}`
- **Subject**: pl. `EPISTEME – foglalás visszaigazolása ({{confirmation_code}})`
- **Content** (példa, szabadon formázható):

```
Tisztelt {{guest_name}}!

Örömmel visszaigazoljuk asztalfoglalását az EPISTEME étterembe.

Foglalási kód: {{confirmation_code}}
Dátum: {{reservation_date}}
Időpont: {{reservation_time}}
Létszám: {{guest_count}} fő
Előleg: {{deposit}}

Cím: {{restaurant_address}}
Kapcsolat: {{restaurant_email}}

Tisztelettel,
{{restaurant_name}}
```

Elérhető változók: `to_email`, `guest_name`, `guest_email`, `guest_phone`,
`reservation_date`, `reservation_time`, `guest_count`, `confirmation_code`,
`deposit`, `restaurant_name`, `restaurant_address`, `restaurant_email`.

### 3/b — Lemondási sablon (lemondáskor)

- **Név**: pl. `EPISTEME – foglalás lemondva`
- **To Email**: `{{to_email}}`
- **Subject**: pl. `EPISTEME – lemondott foglalás ({{confirmation_code}})`
- **Content** (példa):

```
Tisztelt Címzett!

Az alábbi foglalás lemondásra került.

Foglalási kód: {{confirmation_code}}
Név: {{guest_name}}
Dátum: {{reservation_date}}
Időpont: {{reservation_time}}
Létszám: {{guest_count}} fő
Lemondás időpontja: {{cancelled_at}}

Kapcsolat: {{restaurant_email}}

Tisztelettel,
{{restaurant_name}}
```

A `{{recipient_role}}` változó értéke `guest` vagy `restaurant` — ha szeretnél,
ezzel meg tudod különböztetni a két példányt (pl. a vendégnek szóló változatban
más a megszólítás), de nem kötelező használni.

Mindkét sablon mentése után másold ki a **Template ID**-t (`template_...`).

## 4. lépés — Környezeti változók beállítása

**Vercelben**: Project → Settings → Environment Variables, majd újradeploy.
**Lokálisan**: `.env.local` fájlba.

```
EMAILJS_SERVICE_ID=service_vk94auf
EMAILJS_PUBLIC_KEY=bI2mj0KaJZMJnD6Lq
EMAILJS_PRIVATE_KEY=<a 2. lépésben kimásolt privát kulcs>
EMAILJS_TEMPLATE_CONFIRMATION=<a 3/a sablon Template ID-ja>
EMAILJS_TEMPLATE_CANCELLATION=<a 3/b sablon Template ID-ja>
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

## Megjegyzés a meglévő kliens-oldali küldésről

A `src/components/ReservationSection.tsx` továbbra is küld egy levelet
foglaláskor a régi `template_nezbzjh` sablonnal, a böngészőből. Ezt
**szándékosan nem nyúltam hozzá**, mert nem tudom, kinek megy (a címzett a
sablonban van beállítva) — ha az étteremnek szól, akkor a mostani két új levél
mellett hasznos kiegészítés marad.

Ha viszont az a sablon is a **vendégnek** küld, akkor a vendég két
visszaigazolást fog kapni. Ilyenkor a régit így lehet kikapcsolni: a
`ReservationSection.tsx`-ben töröld a `void sendConfirmationEmail(call);` sort
(és utána a fölöslegessé váló `sendConfirmationEmail` függvényt, az `emailjs`
importot és az `emailFailed` state-et). Szólj, és megcsinálom.

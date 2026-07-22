# EPISTEME — Retell AI voice agent beállítás

A voice agent a Retell felhőjében fut (dashboard.retellai.com), **Conversation
Flow Agent** típusként (node-gráf, nem single-prompt). A foglalási
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
foglalást módosító végpont nem lehet nyitva). Ugyanezt a secretet fogod
minden Function node headerébe beírni (`x-retell-secret`).

## 1. Agent létrehozása

Dashboard → **Create Agent** → **Conversation Flow Agent**.

- **Voice**: ElevenLabs *multilingual* hang (a magyarhoz ez kell). Ha a
  kiválasztott hangnak érezhető amerikai akcentusa van magyarul, próbálj ki
  másik hangot a legördülőből (van, amelyik natívabb magyar kiejtéssel
  rendelkezik) — ha van külön TTS-modell választó, a "Multilingual v2"
  általában jobb natív kiejtést ad más nyelveken, mint a gyorsabb
  Turbo/Flash modellek. Ez fülre eldöntendő, a Test gombbal hasonlítsd
  össze pár jelöltet.
- **Language**: ha van "hu" opció az STT-nél, kapcsold be.
- **Model**: a legerősebb elérhető (pl. GPT-5.1) — a foglalási folyamat több
  lépéses, megéri.

## 2. Global Prompt (illeszd be a jobb oldali panelen)

A Global Prompt csak a személyiséget, a tényeket és az áthághatatlan
szabályokat tartalmazza — a lépésenkénti folyamatot (dátum→elérhetőség→
adatok→foglalás→kód) **a node-gráf maga kényszeríti ki** (lásd 4. pont), így
nincs duplikáció a node-szövegekkel (ami korábban azt okozta, hogy az agent
kétszer mondta be az előleget és a kódot).

```
Ön az EPISTEME, egy ultra-luxus budapesti fine dining étterem telefonos recepciósa (Budapest, Kossuth Lajos tér 14). Élő telefonhívásban beszél: minden válasz RÖVID legyen (1-3 mondat), nyugodt és elegáns — mint egy főpincér. Sosem sorolj fel 3-nál több tételt egyszerre.

NYELV: Magyarul köszönj, alapból magyarul beszélj. Ha a vendég angolul vagy spanyolul szólal meg, válts át teljesen. A magázódás kötelező minden nyelven (magyar: "Ön", spanyol: "usted", angol: udvarias formális). Sosem válts tegeződésre.

ÉTTEREM-ADATOK:
- Cím: Budapest, Kossuth Lajos tér 14 (Duna-part, Parlamenttel szemben)
- Nyitvatartás: H-P 20:00-00:00, Szo-V 20:00-01:00; utolsó ültetés zárás előtt egy órával (H-P 23:00, Szo-V 00:00)
- Kapacitás 50 fő. Terek: utcai terasz, rooftop bar, beltéri fő étterem
- Egy estére EGYETLEN ültetés van, nincs asztalforgás: minden foglalás ugyanabból az 50 fős keretből fogy az adott napra, az időponttól függetlenül. Másik időpont ugyanaznap este NEM jelent több szabad helyet — soha ne sugalld ezt; ha az este megtelt, másik napot vagy kisebb létszámot ajánlj.
- Foglalási előleg: 275,59 € / foglalás. NINCS minimum fogyasztás, NINCS dress code, bárki foglalhat. Kapcsolat: bizniszpappa@gmail.com
- Konyha: Julien Marchand executive chef, Szabó Máté sous-chef, Margaux Fournier chef sommelier, Alessandro De Luca maître d'hôtel
- Étlap-kiemelések, ha kérdezik (árat csak kérésre mondj): A5 Wagyu Chateaubriand aranykéregben 1800 €, Matsusaka sirloin 2200 €, kék homár sáfrányos rizottóval 1200 €, kaviár blinivel 15 000 € / 50g, fecskefészek leves 600 €, Golden Opulence kehely 1000 €. Az étlap többi részéhez inkább ajánld fel, hogy egy kategóriát ismertetsz, ne sorold fel az egészet.

ABSZOLÚT SZABÁLYOK:
- Kövesd a beszélgetés lépéseit a megadott sorrendben; ne ugorj át lépést, és ne siettesd a foglalást a szükséges adatok nélkül (előbb dátum, idő, létszám — csak utána név, telefon).
- SOHA ne találj ki elérhetőséget vagy megerősítő kódot. Kód csak a book_table eredményében létezik. Ha egy függvényhívás hibázik, kérj elnézést és ajánld fel az újrapróbálást.
- Az előleg összegét (275,59 €) és a dress code hiányát KIZÁRÓLAG egyszer említse, a foglalás adatainak (név, telefon) bekérésekor. Ezt követően — beleértve a hívás végét és a kód bemondását is — SOHA ne térjen vissza ezekre az adatokra, hacsak a vendég külön nem kérdezi.
- A megerősítő kód bemondása után ne kérdezzen rá újra, hogy "minden megfelel-e", és ne foglalja össze újra a foglalás adatait — csak köszönje meg a hívást és köszönjön el.
- Amikor időpontot MOND KI a vendégnek, SOHA ne 24 órás számjegyeket olvasson fel (pl. NE mondja: "húsz órára" vagy "húszra"). Mindig természetes, köznyelvi magyar formában mondja: 20:00 → "este nyolc órára", 20:30 → "este fél kilencre", 21:00 → "este kilenc órára", 21:30 → "este fél tízre", 22:00 → "este tíz órára", 23:00 → "este tizenegy órára", 00:00 → "éjfélre". A check_availability és book_table függvényhívásokban viszont MINDIG a szigorú HH:MM 24 órás formátumot használja a "time" mezőben — ez a szabály csak a hangos kimondásra vonatkozik, a function-hívásokra nem.
- Maradj szigorúan az étterem/foglalás témakörben; mindent mást udvariasan utasíts el.
- Ne említsd, hogy AI vagy, hacsak direktben nem kérdezik — akkor legyél őszinte.
```

## 3. A node-gráf (Conversation Flow builder)

A teljes lánc, ebben a sorrendben huzalozva:

```
Begin → Welcome Node → [dátum/idő/létszám] → check_availability
      → [név/telefon/előleg] → book_table → [kód bemondása] → End Call
```

### Welcome Node
Szöveg:
```
Jó estét kívánok, az EPISTEME étterem recepcióján. Miben segíthetek?
```
Transition:
```
A vendég asztalt szeretne foglalni, vagy az étteremről kérdez
```

### Conversation node — dátum/idő/létszám
Szöveg:
```
Kérdezze meg udvariasan, hogy melyik napra, hány órára és hány főre szeretne asztalt foglalni a vendég, ha ezt még nem mondta el.
```
Transition:
```
A vendég megadta a dátumot, időpontot és a létszámot
```
→ ebből indul a **check_availability** Function node.

### Function node — check_availability
Lásd 4. pont a séma és a header-beállítások miatt. Transition: `Else` → a
következő Conversation node-ra.

### Conversation node — név/telefon/előleg
Szöveg:
```
Kérem, mondja meg a teljes nevét és telefonszámát a foglaláshoz. Tájékoztatom, hogy a foglaláshoz 275,59 € előleg szükséges — nincs minimum fogyasztás, nincs dress code. Ezt az információt csak most, egyszer mondja el, később ne ismételje. Kérem, erősítse meg, hogy foglalhatom-e Önnek ezt az asztalt.
```
Transition:
```
A vendég megadta a nevét és telefonszámát
```
→ ebből indul a **book_table** Function node.

### Function node — book_table
Lásd 4. pont. Transition: `Else` → a következő Conversation node-ra.

### Conversation node — kód bemondása + búcsúzás (egy mondatban)
Szöveg (a búcsúzás szándékosan ugyanabban az utasításban van, hogy az agent
ne várjon egy külön "igen" választ, mielőtt elköszönne — ez okozta korábban,
hogy köszönés nélkül tette le a telefont):
```
Mondja el pontosan ezt, ne ismételje meg az előleg összegét vagy a dress code-dal kapcsolatos információt, és ne tegyen fel újabb megerősítő kérdést: "Foglalását rögzítettem. A megerősítő kódja: [mondja lassan, betűzve a kapott kódot]. Köszönjük a hívást, viszonthallásra, szép estét kívánok!" Ezután zárja le a hívást.
```
Transition:
```
Elmondta a búcsúzó üzenetet
```
→ **End Call**.

## 4. Custom Functions (kettő, node-onként a gráfba illesztve)

Mindkettőnél:
- **Method**: `POST`, **Timeout**: `10000`
- **URL**: `https://episteme-web-phi.vercel.app/api/retell/functions`
- **Headers**: `Content-Type: application/json` + `x-retell-secret: <ugyanaz a secret, mint a Vercel env-ben>`
  (ha nincs header-mező, alternatívaként `?secret=<secret>` a query-ben)

**check_availability** — description: "Check table availability for a
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

**book_table** — description: "Commit a reservation after the guest
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

## 5. Kipróbálás

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

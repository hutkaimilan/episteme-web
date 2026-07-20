# EPISTEME — Project Source of Truth

## 0. Mi ez
Ultra-luxus fine dining étterem egyoldalas (single-page) marketing weboldala + beépített AI recepciós (asztalfoglalás). Pozicionálás: "a világ 0,01%-áért". A hangulat: obszidiánfekete, patinás arany, gyertyafény, csend, súly, kizárólagosság. Referencia-érzés: Aman / Le Bristol / Alinea. Tilos: olcsó, sablonos, zsúfolt, hangos.

## 1. Tech stack (kötelező)
- Next.js App Router + TypeScript, src/ könyvtár.
- Tailwind CSS (design tokenek lentről). Framer Motion animációkhoz. lucide-react ikonok. clsx + tailwind-merge.
- Fontok: next/font/google → Cormorant Garamond (display), Inter (UI/body).
- i18n: kliens-oldali, context-alapú (useI18n()), NEM route-alapú. Nyelvek: hu (alap), en, es. localStorage-ban tárolt választás.
- AI recepciós (későbbi fázis): szerver-oldali /app/api/chat/route.ts, a GEMINI_API_KEY env változóból (Google AI Studio, ingyenes szint), modell gemini-2.0-flash, maxOutputTokens: 1000. SOHA nincs API-kulcs a kliensen.
- EmailJS: kliens-oldali, foglalás után. Deploy: Vercel ajánlott (env var-ral).

## 2. Design tokenek

### Színek (Tailwind theme.extend.colors)
- obsidian: #0A0908  (fő háttér)
- obsidian-800: #12100D (elevált felület)
- obsidian-700: #1A1712 (kártya háttér)
- gold: #C6A15B  (elsődleges arany akcentus)
- gold-bright: #E3C77E (hover/aktív)
- gold-deep: #8C6D2F (mély arany, árnyék/keret)
- ivory: #F1E9DC  (címsor szöveg)
- ivory-muted: #C9C1B4 (kenyérszöveg)
- ivory-faint: #8E877A (halvány, meta)
- line: rgba(198,161,91,0.18) (arany hajszálvékony keret)
- wine: #5A2A2E (opcionális mély bordó másodlagos akcentus, nagyon ritkán)

CSS változóként is tedd elérhetővé (:root a globals.css-ben), pl. --obsidian, --gold stb.

### Tipográfia
- Display/címsor: Cormorant Garamond. Nagy méret, nagy sortávolság-kontraszt (light + medium keverés). A címsorokban KEVERJ italic + regular szót ugyanabban a sorban a dinamikus, couture hatásért.
- UI/kenyérszöveg: Inter, kis méret, magas kontraszt (ivory / ivory-muted).
- "Eyebrow" (mini címke): Inter, uppercase, letter-spacing: 0.28em, gold, kis méret.
- Skála: hero clamp(3rem, 8vw, 7rem); szekció-cím clamp(2rem, 5vw, 3.75rem); kenyér 1rem–1.125rem.
- border-radius: visszafogott. Kártyák 10px, gombok pill (9999px), képek 8px. A luxus inkább kevesebb lekerekítés.

### Kártyák (glassmorphism, visszafogottan)
- Háttér obsidian-700 ~92% + backdrop-blur-sm; 1px line keret; belső padding bőséges; hoverre a keret gold felé világosodik, enyhe emelkedés (translateY(-4px)), lassú átmenet.

### Mozgás
- Framer Motion whileInView, viewport={{ once: true, margin: '-10%' }}.
- Időtartam 0.8–1.2s, easing [0.22, 1, 0.36, 1], stagger 0.08–0.12s.
- Hero: Ken Burns (scale 1→1.08, ~14s, infinite alternate) + headline lassú fade.
- prefers-reduced-motion: minden nem-esszenciális mozgás kikapcsol.

## 3. Adatréteg konvenció
A tartalom TÍPUSOS adatfájlokból jön (src/data/*.ts), a komponensek ezeken map-elnek. Minden szöveges mező i18n-kulcsot használ (nem beégetett szöveg). Példa struktúra (a menü teljes tartalma a 4. fázisban kerül be):

export type Dish = {
  id: string;
  image?: string;           // '/images/menu/xy.png' — hiányozhat (italok)
  price: string;            // pl. '1 800 €'
  chefsSelection?: boolean; // séf ajánlása kiemelés
  category: 'amuse'|'cold'|'warm'|'soup'|'seafood'|'meat'|'cheese'|'dessert'|'drink';
  nameKey: string;          // i18n kulcs
  descKey: string;          // i18n kulcs
};

## 4. Étterem-adatok (kanonikus)
- Név: EPISTEME. Cím: Budapest, Kossuth Lajos tér 14. E-mail: bizniszpappa@gmail.com
- Nyitvatartás: H–P 20:00–00:00, Szo–V 20:00–01:00. Kapacitás: 50 fő. Terek: terasz, rooftop bar, beltéri fő étterem.
- Foglalási előleg: 275,59 € / foglalás. Nincs minimum költés, nincs dress code, bárki foglalhat.
- Agent hangnem: magázódás kötelező, minden nyelven a formális regiszter.
- Foglalási kód formátum: EP-XXXX (4 számjegy). A kódot MINDIG a szerver generálja — a modell csak visszamondja.

## 5. Személyzet (kanonikus — bio szövegek a 3. fázisban)
- Julien Marchand — Executive Chef — francia, 49 — /images/team/julien.png
- Alessandro De Luca — Maître d'hôtel — olasz, 52 — /images/team/alessandro.png
- Margaux Fournier — Chef Sommelier — francia, 41 — /images/team/margaux.png
- Kovács Réka — Recepció / Hostess — magyar, 29 — /images/team/reka.png
- Nagy Bence — Chef Voiturier — magyar, 35 — /images/team/bence.png
- Szabó Máté — Sous-Chef — magyar, 36 — /images/team/mate.png
- Csoportkép: /images/team/group.png (~45 fős brigád).

## 6. Szekciók sorrendje (single page)
1. Hero (#kezdolap) 2. Helyszín galéria (#helyszin) 3. Konyha & Csapat (#csapat) 4. Étlap (#etlap) 5. Borkultúra / Sommelier (#borkultura) 6. Foglalás — AI recepciós (#foglalas) 7. Kapcsolat (#kapcsolat) + Footer. Jogi: /adatvedelem, /impresszum.

## 7. SEO
- title: "EPISTEME — Fine Dining · Budapest" ; description (HU alap): "Európa legexkluzívabb asztala Budapesten. A világ 0,01%-áért. Foglalás a Kossuth Lajos téren."
- Open Graph + Twitter card, kép: /images/brand/og-cover.jpg. lang a kiválasztott nyelvhez kötve. themeColor #0A0908.

## 8. Hero copy (mindhárom nyelv, italic = *csillag közötti* rész)
- HU: eyebrow "BUDAPEST · KOSSUTH LAJOS TÉR 14" / sor1 "Az *ízlelés* tudománya." / sor2 "A világ *0,01%*-áért." / alcím "Ötven hely. Egy este. Egy felejthetetlen asztal a Duna partján." / CTA "Asztalfoglalás"
- EN: eyebrow "BUDAPEST · KOSSUTH LAJOS SQUARE 14" / "The *science* of taste." / "For the world's *0.01%*." / "Fifty seats. One evening. One unforgettable table on the Danube." / CTA "Reserve"
- ES: eyebrow "BUDAPEST · PLAZA KOSSUTH LAJOS 14" / "La *ciencia* del gusto." / "Para el *0,01%* del mundo." / "Cincuenta plazas. Una noche. Una mesa inolvidable junto al Danubio." / CTA "Reservar"

## 9. Nav / footer / cookie címkék (i18n)
- Nav linkek: Helyszín/Location/Ubicación · Konyha & Csapat/Kitchen & Team/Cocina y Equipo · Étlap/Menu/Carta · Borkultúra/Wine/Vinos · Kapcsolat/Contact/Contacto.
- Cookie: HU "Sütiket használunk az élmény javításához." / "Elfogadom" ; EN "We use cookies to enhance your experience." / "Accept" ; ES "Usamos cookies para mejorar su experiencia." / "Aceptar".

## 10. Amit SOHA nem csinálunk
- Nincs kitalált Michelin-csillag, díj vagy sajtóidézet. Nincs stock-fotó a sajátok helyett. Az arany nem háttérszín. Nincs bouncy/gyors animáció. Nincs beégetett szöveg (mindig i18n). A magázódás minden nyelven kötelező.

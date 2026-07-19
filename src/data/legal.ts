import type { Lang } from '@/i18n/dictionaries';

export type LegalSection = { heading: string; body: string[] };
export type LegalContent = { intro: string; sections: LegalSection[] };

/**
 * Template legal copy — clearly marked in the UI as a draft to be reviewed by
 * a lawyer before publication. Kept out of the i18n dictionary to keep the
 * shell dictionary lean; still fully trilingual and selected via useI18n().
 */
export const privacyContent: Record<Lang, LegalContent> = {
  hu: {
    intro:
      'Az EPISTEME (Budapest, Kossuth Lajos tér 14) elkötelezett a látogatói és vendégei személyes adatainak védelme mellett. Jelen tájékoztató összefoglalja, milyen adatokat, milyen célból és meddig kezelünk.',
    sections: [
      {
        heading: '1. Az adatkezelő',
        body: [
          'Adatkezelő: EPISTEME (a továbbiakban: „Étterem”). Székhely: Budapest, Kossuth Lajos tér 14. Kapcsolat: bizniszpappa@gmail.com.',
        ],
      },
      {
        heading: '2. A kezelt adatok köre',
        body: [
          'Asztalfoglalás során kezeljük a vendég nevét, e-mail-címét, telefonszámát, a foglalás időpontját és a vendégek számát. A weboldal működéséhez szükséges technikai adatok (például nyelvi beállítás, süti-hozzájárulás) a látogató eszközén, helyi tárolóban kerülnek elmentésre.',
        ],
      },
      {
        heading: '3. Az adatkezelés célja és jogalapja',
        body: [
          'Az adatkezelés célja az asztalfoglalások kezelése és a vendégekkel való kapcsolattartás. Jogalapja a szerződés teljesítése (GDPR 6. cikk (1) b) pont), illetve a látogató hozzájárulása (GDPR 6. cikk (1) a) pont).',
        ],
      },
      {
        heading: '4. Az adatkezelés időtartama',
        body: [
          'A foglalási adatokat a foglalás teljesítését követő 1 évig őrizzük meg, ezt követően törlésre kerülnek. A hozzájáruláson alapuló adatkezelés a hozzájárulás visszavonásáig tart.',
        ],
      },
      {
        heading: '5. Az érintettek jogai',
        body: [
          'A vendég bármikor kérheti a rá vonatkozó személyes adatokhoz való hozzáférést, azok helyesbítését, törlését vagy kezelésének korlátozását, továbbá élhet az adathordozhatósághoz való jogával. Panasszal a Nemzeti Adatvédelmi és Információszabadság Hatósághoz (NAIH) fordulhat.',
        ],
      },
      {
        heading: '6. Sütik (cookie-k)',
        body: [
          'A weboldal kizárólag a működéshez szükséges, valamint a felhasználói élményt javító beállításokat tárol (nyelvválasztás, süti-hozzájárulás). Harmadik féltől származó nyomkövető sütiket nem használunk.',
        ],
      },
    ],
  },
  en: {
    intro:
      'EPISTEME (Budapest, Kossuth Lajos Square 14) is committed to protecting the personal data of its visitors and guests. This notice summarises what data we process, for what purpose, and for how long.',
    sections: [
      {
        heading: '1. Data controller',
        body: [
          'Controller: EPISTEME (hereinafter the “Restaurant”). Registered address: Budapest, Kossuth Lajos Square 14. Contact: bizniszpappa@gmail.com.',
        ],
      },
      {
        heading: '2. Data we process',
        body: [
          'When you reserve a table we process your name, e-mail address, phone number, the date of the reservation and the number of guests. Technical preferences required for the website to function (such as language choice and cookie consent) are stored locally on your device.',
        ],
      },
      {
        heading: '3. Purpose and legal basis',
        body: [
          'We process data to manage reservations and to communicate with our guests. The legal basis is the performance of a contract (Art. 6(1)(b) GDPR) and, where applicable, your consent (Art. 6(1)(a) GDPR).',
        ],
      },
      {
        heading: '4. Retention',
        body: [
          'Reservation data is retained for 1 year after the reservation has been fulfilled and is then deleted. Processing based on consent lasts until the consent is withdrawn.',
        ],
      },
      {
        heading: '5. Your rights',
        body: [
          'You may at any time request access to, rectification or erasure of your personal data, or restriction of its processing, and you may exercise your right to data portability. You may lodge a complaint with your supervisory authority (in Hungary: NAIH).',
        ],
      },
      {
        heading: '6. Cookies',
        body: [
          'The website only stores settings necessary for its operation and for improving your experience (language choice, cookie consent). We do not use third-party tracking cookies.',
        ],
      },
    ],
  },
  es: {
    intro:
      'EPISTEME (Budapest, Plaza Kossuth Lajos 14) se compromete a proteger los datos personales de sus visitantes y clientes. Este aviso resume qué datos tratamos, con qué finalidad y durante cuánto tiempo.',
    sections: [
      {
        heading: '1. Responsable del tratamiento',
        body: [
          'Responsable: EPISTEME (en adelante, el «Restaurante»). Domicilio: Budapest, Plaza Kossuth Lajos 14. Contacto: bizniszpappa@gmail.com.',
        ],
      },
      {
        heading: '2. Datos que tratamos',
        body: [
          'Al reservar una mesa tratamos su nombre, dirección de correo electrónico, número de teléfono, la fecha de la reserva y el número de comensales. Las preferencias técnicas necesarias para el funcionamiento del sitio (idioma, consentimiento de cookies) se almacenan localmente en su dispositivo.',
        ],
      },
      {
        heading: '3. Finalidad y base jurídica',
        body: [
          'Tratamos los datos para gestionar las reservas y comunicarnos con nuestros clientes. La base jurídica es la ejecución de un contrato (art. 6.1.b del RGPD) y, en su caso, su consentimiento (art. 6.1.a del RGPD).',
        ],
      },
      {
        heading: '4. Conservación',
        body: [
          'Los datos de reserva se conservan durante 1 año tras la reserva y después se eliminan. El tratamiento basado en el consentimiento dura hasta que este se retire.',
        ],
      },
      {
        heading: '5. Sus derechos',
        body: [
          'Puede solicitar en cualquier momento el acceso, la rectificación o la supresión de sus datos personales, o la limitación de su tratamiento, así como ejercer su derecho a la portabilidad. Puede presentar una reclamación ante la autoridad de control (en Hungría: NAIH).',
        ],
      },
      {
        heading: '6. Cookies',
        body: [
          'El sitio web solo almacena los ajustes necesarios para su funcionamiento y para mejorar su experiencia (idioma, consentimiento de cookies). No utilizamos cookies de seguimiento de terceros.',
        ],
      },
    ],
  },
};

export const imprintContent: Record<Lang, LegalContent> = {
  hu: {
    intro: 'A weboldal üzemeltetőjének adatai az elektronikus kereskedelmi szolgáltatásokról szóló 2001. évi CVIII. törvény alapján.',
    sections: [
      {
        heading: 'Üzemeltető',
        body: [
          'Név: EPISTEME',
          'Cím: Budapest, Kossuth Lajos tér 14',
          'E-mail: bizniszpappa@gmail.com',
        ],
      },
      {
        heading: 'Tevékenység',
        body: [
          'Fine dining étterem. Nyitvatartás: hétfő–péntek 20:00–00:00, szombat–vasárnap 20:00–01:00. Kapacitás: 50 fő.',
        ],
      },
      {
        heading: 'Tárhelyszolgáltató',
        body: [
          'A tárhelyszolgáltató adatai a weboldal éles közzététele előtt kerülnek kiegészítésre.',
        ],
      },
    ],
  },
  en: {
    intro: 'Operator details for this website, provided in accordance with applicable e-commerce regulations.',
    sections: [
      {
        heading: 'Operator',
        body: [
          'Name: EPISTEME',
          'Address: Budapest, Kossuth Lajos Square 14',
          'E-mail: bizniszpappa@gmail.com',
        ],
      },
      {
        heading: 'Activity',
        body: [
          'Fine dining restaurant. Opening hours: Monday–Friday 8 pm–12 am, Saturday–Sunday 8 pm–1 am. Capacity: 50 guests.',
        ],
      },
      {
        heading: 'Hosting provider',
        body: [
          'Hosting provider details will be added before the website goes live.',
        ],
      },
    ],
  },
  es: {
    intro: 'Datos del operador de este sitio web, facilitados de conformidad con la normativa aplicable de comercio electrónico.',
    sections: [
      {
        heading: 'Operador',
        body: [
          'Nombre: EPISTEME',
          'Dirección: Budapest, Plaza Kossuth Lajos 14',
          'Correo electrónico: bizniszpappa@gmail.com',
        ],
      },
      {
        heading: 'Actividad',
        body: [
          'Restaurante de alta cocina. Horario: lunes–viernes 20:00–00:00, sábado–domingo 20:00–01:00. Capacidad: 50 comensales.',
        ],
      },
      {
        heading: 'Proveedor de alojamiento',
        body: [
          'Los datos del proveedor de alojamiento se añadirán antes de la publicación del sitio.',
        ],
      },
    ],
  },
};

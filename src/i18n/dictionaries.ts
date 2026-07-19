export type Lang = 'hu' | 'en' | 'es';

/** One string per location-gallery image, keyed by LocationImage id. */
export type GalleryImageText = {
  homlokzat: string;
  'fo-terem': string;
  'rooftop-bar': string;
  diszasztal: string;
  'rooftop-terasz': string;
  terasz: string;
};

export type Dictionary = {
  nav: {
    location: string;
    team: string;
    menu: string;
    wine: string;
    contact: string;
    reserve: string;
    openMenu: string;
    closeMenu: string;
  };
  hero: {
    eyebrow: string;
    line1: string; // italic segments marked with *asterisks*
    line2: string;
    subtitle: string;
    cta: string;
    scrollCue: string;
    imageAlt: string;
  };
  sections: {
    helyszin: { eyebrow: string; title: string };
    csapat: { eyebrow: string; title: string };
    etlap: { eyebrow: string; title: string };
    borkultura: { eyebrow: string; title: string };
    foglalas: { eyebrow: string; title: string };
    kapcsolat: { eyebrow: string; title: string };
  };
  gallery: {
    captions: GalleryImageText;
    alts: GalleryImageText;
    lightbox: { close: string; prev: string; next: string };
  };
  footer: {
    tagline: string;
    addressLabel: string;
    address: string;
    hoursLabel: string;
    hoursWeekdays: string;
    hoursWeekend: string;
    contactLabel: string;
    instagramAria: string;
    legalLabel: string;
    privacy: string;
    imprint: string;
    microline: string;
  };
  cookie: {
    text: string;
    accept: string;
    privacyLink: string;
  };
  legal: {
    backHome: string;
    privacyTitle: string;
    imprintTitle: string;
    templateNote: string;
  };
};

const hu: Dictionary = {
  nav: {
    location: 'Helyszín',
    team: 'Konyha & Csapat',
    menu: 'Étlap',
    wine: 'Borkultúra',
    contact: 'Kapcsolat',
    reserve: 'Asztalfoglalás',
    openMenu: 'Menü megnyitása',
    closeMenu: 'Menü bezárása',
  },
  hero: {
    eyebrow: 'BUDAPEST · KOSSUTH LAJOS TÉR 14',
    line1: 'Az *ízlelés* tudománya.',
    line2: 'A világ *0,01%*-áért.',
    subtitle: 'Ötven hely. Egy este. Egy felejthetetlen asztal a Duna partján.',
    cta: 'Asztalfoglalás',
    scrollCue: 'Görgessen',
    imageAlt:
      'Az EPISTEME étterem esti homlokzata vörös szőnyeggel a budapesti Kossuth Lajos téren',
  },
  sections: {
    helyszin: { eyebrow: 'A helyszín', title: 'Ahol az este *emlékké* válik.' },
    csapat: { eyebrow: 'Konyha & Csapat', title: 'A precizitás művészei' },
    etlap: { eyebrow: 'Étlap', title: 'Egy este partitúrája' },
    borkultura: { eyebrow: 'Borkultúra', title: 'A pince csendje' },
    foglalas: { eyebrow: 'Foglalás', title: 'Az Ön asztala' },
    kapcsolat: { eyebrow: 'Kapcsolat', title: 'Írjon nekünk' },
  },
  gallery: {
    captions: {
      homlokzat: 'A bejárat — az első pillanat, ami mindent elmond.',
      'fo-terem': 'A fő terem — kristályfény alatt lassul az idő.',
      'rooftop-bar': 'A rooftop bar — háttérben a város minden fénye.',
      diszasztal: 'A díszasztal — azoknak, akiknek a diszkréció természetes.',
      'rooftop-terasz': 'A tetőterasz — szabad ég, odalent a Duna.',
      terasz: 'A terasz — fényfüzérek az esti utca felett.',
    },
    alts: {
      homlokzat:
        'Az étterem esti homlokzata vörös szőnyeggel és veterán luxusautóval, háttérben a Parlament',
      'fo-terem':
        'A fő étterem kristálycsillárral, bordó bársonyszékekkel és nagyméretű festménnyel',
      'rooftop-bar':
        'A rooftop bar fekete márványpulttal és üvegfallal, kilátással a Parlamentre',
      diszasztal:
        'Privát díszasztal gyertyatartókkal, mögötte bronz-arany festmény',
      'rooftop-terasz':
        'Tetőterasz smaragdzöld bársonyfotelekkel és tűzrakókkal, kilátással a Parlamentre',
      terasz:
        'Utcaszinti terasz olajfákkal és fényfüzérekkel, háttérben a Parlament',
    },
    lightbox: {
      close: 'Bezárás',
      prev: 'Előző kép',
      next: 'Következő kép',
    },
  },
  footer: {
    tagline: 'Az ízlelés tudománya.',
    addressLabel: 'Cím',
    address: 'Budapest, Kossuth Lajos tér 14',
    hoursLabel: 'Nyitvatartás',
    hoursWeekdays: 'H–P · 20:00–00:00',
    hoursWeekend: 'Szo–V · 20:00–01:00',
    contactLabel: 'Kapcsolat',
    instagramAria: 'EPISTEME az Instagramon',
    legalLabel: 'Jogi információk',
    privacy: 'Adatvédelem',
    imprint: 'Impresszum',
    microline: 'For the world’s 0.01%',
  },
  cookie: {
    text: 'Sütiket használunk az élmény javításához.',
    accept: 'Elfogadom',
    privacyLink: 'Adatvédelem',
  },
  legal: {
    backHome: 'Vissza a főoldalra',
    privacyTitle: 'Adatvédelmi tájékoztató',
    imprintTitle: 'Impresszum',
    templateNote:
      'Ez a dokumentum sablon, amelyet közzététel előtt jogásznak kell felülvizsgálnia.',
  },
};

const en: Dictionary = {
  nav: {
    location: 'Location',
    team: 'Kitchen & Team',
    menu: 'Menu',
    wine: 'Wine',
    contact: 'Contact',
    reserve: 'Reserve',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
  },
  hero: {
    eyebrow: 'BUDAPEST · KOSSUTH LAJOS SQUARE 14',
    line1: 'The *science* of taste.',
    line2: 'For the world’s *0.01%*.',
    subtitle: 'Fifty seats. One evening. One unforgettable table on the Danube.',
    cta: 'Reserve',
    scrollCue: 'Scroll',
    imageAlt:
      'The evening façade of EPISTEME restaurant with a red carpet on Kossuth Lajos Square, Budapest',
  },
  sections: {
    helyszin: { eyebrow: 'The setting', title: 'Where the evening becomes a *memory*.' },
    csapat: { eyebrow: 'Kitchen & Team', title: 'Artists of precision' },
    etlap: { eyebrow: 'Menu', title: 'The score of an evening' },
    borkultura: { eyebrow: 'Wine', title: 'The silence of the cellar' },
    foglalas: { eyebrow: 'Reservation', title: 'Your table' },
    kapcsolat: { eyebrow: 'Contact', title: 'Write to us' },
  },
  gallery: {
    captions: {
      homlokzat: 'The entrance — the first moment that says everything.',
      'fo-terem': 'The main room — time slows beneath the chandelier.',
      'rooftop-bar': 'The rooftop bar — the skyline as a backdrop.',
      diszasztal: 'The private table — for those who require discretion.',
      'rooftop-terasz': 'The rooftop terrace — open air, the Danube below.',
      terasz: 'The terrace — string lights above the evening street.',
    },
    alts: {
      homlokzat:
        'The restaurant’s evening façade with a red carpet and a vintage luxury car, Parliament in the background',
      'fo-terem':
        'The main dining room with a crystal chandelier, burgundy velvet chairs and a large painting',
      'rooftop-bar':
        'The rooftop bar with a black marble counter and glass wall overlooking Parliament',
      diszasztal:
        'A private ceremonial table with candelabras, a bronze-and-gold painting behind it',
      'rooftop-terasz':
        'The rooftop terrace with emerald velvet armchairs and fire pits overlooking Parliament',
      terasz:
        'The street-level terrace with olive trees and string lights, Parliament in the background',
    },
    lightbox: {
      close: 'Close',
      prev: 'Previous image',
      next: 'Next image',
    },
  },
  footer: {
    tagline: 'The science of taste.',
    addressLabel: 'Address',
    address: 'Budapest, Kossuth Lajos Square 14',
    hoursLabel: 'Opening hours',
    hoursWeekdays: 'Mon–Fri · 8 pm–12 am',
    hoursWeekend: 'Sat–Sun · 8 pm–1 am',
    contactLabel: 'Contact',
    instagramAria: 'EPISTEME on Instagram',
    legalLabel: 'Legal',
    privacy: 'Privacy policy',
    imprint: 'Imprint',
    microline: 'For the world’s 0.01%',
  },
  cookie: {
    text: 'We use cookies to enhance your experience.',
    accept: 'Accept',
    privacyLink: 'Privacy policy',
  },
  legal: {
    backHome: 'Back to the homepage',
    privacyTitle: 'Privacy policy',
    imprintTitle: 'Imprint',
    templateNote:
      'This document is a template and must be reviewed by a lawyer before publication.',
  },
};

const es: Dictionary = {
  nav: {
    location: 'Ubicación',
    team: 'Cocina y Equipo',
    menu: 'Carta',
    wine: 'Vinos',
    contact: 'Contacto',
    reserve: 'Reservar',
    openMenu: 'Abrir menú',
    closeMenu: 'Cerrar menú',
  },
  hero: {
    eyebrow: 'BUDAPEST · PLAZA KOSSUTH LAJOS 14',
    line1: 'La *ciencia* del gusto.',
    line2: 'Para el *0,01%* del mundo.',
    subtitle: 'Cincuenta plazas. Una noche. Una mesa inolvidable junto al Danubio.',
    cta: 'Reservar',
    scrollCue: 'Desplácese',
    imageAlt:
      'La fachada nocturna del restaurante EPISTEME con alfombra roja en la plaza Kossuth Lajos de Budapest',
  },
  sections: {
    helyszin: { eyebrow: 'El espacio', title: 'Donde la noche se convierte en un *recuerdo*.' },
    csapat: { eyebrow: 'Cocina y Equipo', title: 'Artistas de la precisión' },
    etlap: { eyebrow: 'Carta', title: 'La partitura de una noche' },
    borkultura: { eyebrow: 'Vinos', title: 'El silencio de la bodega' },
    foglalas: { eyebrow: 'Reserva', title: 'Su mesa' },
    kapcsolat: { eyebrow: 'Contacto', title: 'Escríbanos' },
  },
  gallery: {
    captions: {
      homlokzat: 'La entrada — el primer instante que lo dice todo.',
      'fo-terem': 'La sala principal — el tiempo se detiene bajo la lámpara.',
      'rooftop-bar': 'El bar de la azotea — la ciudad como telón de fondo.',
      diszasztal: 'La mesa privada — para quienes exigen discreción.',
      'rooftop-terasz': 'La terraza superior — cielo abierto, el Danubio abajo.',
      terasz: 'La terraza — luces suspendidas sobre la calle nocturna.',
    },
    alts: {
      homlokzat:
        'Fachada nocturna del restaurante con alfombra roja y un coche clásico de lujo, con el Parlamento al fondo',
      'fo-terem':
        'La sala principal con lámpara de cristal, sillas de terciopelo burdeos y una gran pintura',
      'rooftop-bar':
        'El bar de la azotea con barra de mármol negro y pared de cristal con vistas al Parlamento',
      diszasztal:
        'Mesa privada de gala con candelabros y una pintura en bronce y oro detrás',
      'rooftop-terasz':
        'Terraza superior con sillones de terciopelo esmeralda y fogatas, con vistas al Parlamento',
      terasz:
        'Terraza a pie de calle con olivos y luces colgantes, con el Parlamento al fondo',
    },
    lightbox: {
      close: 'Cerrar',
      prev: 'Imagen anterior',
      next: 'Imagen siguiente',
    },
  },
  footer: {
    tagline: 'La ciencia del gusto.',
    addressLabel: 'Dirección',
    address: 'Budapest, Plaza Kossuth Lajos 14',
    hoursLabel: 'Horario',
    hoursWeekdays: 'Lun–Vie · 20:00–00:00',
    hoursWeekend: 'Sáb–Dom · 20:00–01:00',
    contactLabel: 'Contacto',
    instagramAria: 'EPISTEME en Instagram',
    legalLabel: 'Información legal',
    privacy: 'Política de privacidad',
    imprint: 'Aviso legal',
    microline: 'For the world’s 0.01%',
  },
  cookie: {
    text: 'Usamos cookies para mejorar su experiencia.',
    accept: 'Aceptar',
    privacyLink: 'Política de privacidad',
  },
  legal: {
    backHome: 'Volver a la página principal',
    privacyTitle: 'Política de privacidad',
    imprintTitle: 'Aviso legal',
    templateNote:
      'Este documento es una plantilla y debe ser revisado por un abogado antes de su publicación.',
  },
};

export const dictionaries: Record<Lang, Dictionary> = { hu, en, es };

export const LANGS: Lang[] = ['hu', 'en', 'es'];

export const DEFAULT_LANG: Lang = 'hu';

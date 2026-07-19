export type Lang = 'hu' | 'en' | 'es';

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
    helyszin: { eyebrow: 'A helyszín', title: 'Terek, amelyek hallgatnak' },
    csapat: { eyebrow: 'Konyha & Csapat', title: 'A precizitás művészei' },
    etlap: { eyebrow: 'Étlap', title: 'Egy este partitúrája' },
    borkultura: { eyebrow: 'Borkultúra', title: 'A pince csendje' },
    foglalas: { eyebrow: 'Foglalás', title: 'Az Ön asztala' },
    kapcsolat: { eyebrow: 'Kapcsolat', title: 'Írjon nekünk' },
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
    helyszin: { eyebrow: 'The location', title: 'Rooms that keep silence' },
    csapat: { eyebrow: 'Kitchen & Team', title: 'Artists of precision' },
    etlap: { eyebrow: 'Menu', title: 'The score of an evening' },
    borkultura: { eyebrow: 'Wine', title: 'The silence of the cellar' },
    foglalas: { eyebrow: 'Reservation', title: 'Your table' },
    kapcsolat: { eyebrow: 'Contact', title: 'Write to us' },
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
    helyszin: { eyebrow: 'La ubicación', title: 'Espacios que guardan silencio' },
    csapat: { eyebrow: 'Cocina y Equipo', title: 'Artistas de la precisión' },
    etlap: { eyebrow: 'Carta', title: 'La partitura de una noche' },
    borkultura: { eyebrow: 'Vinos', title: 'El silencio de la bodega' },
    foglalas: { eyebrow: 'Reserva', title: 'Su mesa' },
    kapcsolat: { eyebrow: 'Contacto', title: 'Escríbanos' },
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

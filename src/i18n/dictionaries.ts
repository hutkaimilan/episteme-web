export type Lang = 'hu' | 'en' | 'es';

/** Per-member team texts; the name is identical across languages but still routed through i18n. */
export type TeamMemberText = {
  name: string;
  role: string;
  origin: string;
  bio: string;
};

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
  team: {
    groupCaption: string;
    groupAlt: string;
    members: {
      julien: TeamMemberText;
      alessandro: TeamMemberText;
      margaux: TeamMemberText;
      reka: TeamMemberText;
      bence: TeamMemberText;
      mate: TeamMemberText;
    };
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
    csapat: { eyebrow: 'Konyha & Csapat', title: 'A *precizitás* művészei.' },
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
  team: {
    groupCaption: 'Negyvenöt ember, egyetlen ütemre — az EPISTEME brigádja.',
    groupAlt: 'Az étterem mintegy negyvenöt fős személyzete a homlokzat lépcsőjén, esti fényben',
    members: {
      julien: {
        name: 'Julien Marchand',
        role: 'Executive Chef',
        origin: 'francia',
        bio: 'Harminc év a tűzhely mellett, és máig az első szolgálat izgalmával lép a konyhába. Julien számára az ízlelés nem élvezet, hanem megismerés — minden tányér egy pontosan megfogalmazott gondolat. A konyhája csendes: nála a fegyelem a kreativitás legmagasabb formája.',
      },
      alessandro: {
        name: 'Alessandro De Luca',
        role: 'Maître d’hôtel',
        origin: 'olasz',
        bio: 'Alessandro szerint a vendéglátás olyan színház, ahol a legjobb előadás láthatatlan. Negyed évszázada olvas asztalokat: egy pillantásból tudja, mikor kell megjelenni, és mikor eltűnni. Az estéi végén a vendég nem kiszolgálva érzi magát — hanem megértve.',
      },
      margaux: {
        name: 'Margaux Fournier',
        role: 'Chef Sommelier',
        origin: 'francia',
        bio: 'Margaux a bort történetként kezeli, amelynek az évjárat csak az első mondata. Pincéje lassan, türelemmel épül — akárcsak a bizalom, amellyel a vendégek rábízzák az estéjüket. Ajánlásai sosem hivalkodóak: mindig az ételt, a pillanatot és az embert szolgálják.',
      },
      reka: {
        name: 'Kovács Réka',
        role: 'Recepció / Hostess',
        origin: 'magyar',
        bio: 'Réka az első hang a telefonban és az első mosoly az ajtóban — nála kezdődik az EPISTEME. Fejből tudja a visszatérő vendégek nevét, asztalát, sőt hallgatásaik okát is. Meggyőződése, hogy a figyelem a luxus legritkább formája.',
      },
      bence: {
        name: 'Nagy Bence',
        role: 'Chef Voiturier',
        origin: 'magyar',
        bio: 'Bence keze alatt már a megérkezés is szertartás: egy kitárt ajtó, egy halk köszöntés, és az autó hangtalanul eltűnik az éjszakában. Veterán és kortárs automobilok egyaránt rezzenés nélkül engedelmeskednek neki. Ő az este első és utolsó kézfogása — és mindkettőre emlékezni fog.',
      },
      mate: {
        name: 'Szabó Máté',
        role: 'Sous-Chef',
        origin: 'magyar',
        bio: 'Máté a konyha metronómja: ő tartja a ritmust, amikor ötven vendég estéje egyszerre készül. Napja a hajnali piacon kezdődik, és az utolsó tányér ellenőrzésével zárul. Julien mellett tanulta meg, hogy a tökéletesség nem cél, hanem munkamódszer.',
      },
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
    csapat: { eyebrow: 'Kitchen & Team', title: 'Artists of *precision*.' },
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
  team: {
    groupCaption: 'Forty-five people, one rhythm — the EPISTEME brigade.',
    groupAlt: 'The restaurant’s staff of about forty-five on the front steps of the façade, in evening light',
    members: {
      julien: {
        name: 'Julien Marchand',
        role: 'Executive Chef',
        origin: 'French',
        bio: 'Thirty years at the stove, and he still enters the kitchen with the thrill of a first service. For Julien, taste is not pleasure but understanding — every plate a precisely worded thought. His kitchen is quiet: discipline, to him, is creativity’s highest form.',
      },
      alessandro: {
        name: 'Alessandro De Luca',
        role: 'Maître d’hôtel',
        origin: 'Italian',
        bio: 'Alessandro believes hospitality is theatre in which the finest performance is invisible. He has been reading tables for a quarter of a century: one glance tells him when to appear and when to vanish. At the end of his evenings, guests feel not served — but understood.',
      },
      margaux: {
        name: 'Margaux Fournier',
        role: 'Chef Sommelier',
        origin: 'French',
        bio: 'Margaux treats wine as a story in which the vintage is only the opening line. Her cellar is built slowly, with patience — like the trust guests place in her hands each evening. Her recommendations are never showy: they serve the dish, the moment, and the person.',
      },
      reka: {
        name: 'Kovács Réka',
        role: 'Reception / Hostess',
        origin: 'Hungarian',
        bio: 'Réka is the first voice on the telephone and the first smile at the door — EPISTEME begins with her. She knows returning guests’ names, their tables, even the reasons for their silences. She is convinced that attention is the rarest form of luxury.',
      },
      bence: {
        name: 'Nagy Bence',
        role: 'Chef Voiturier',
        origin: 'Hungarian',
        bio: 'In Bence’s hands, even arrival becomes ceremony: a door held open, a quiet greeting, and the car vanishes soundlessly into the night. Vintage and contemporary automobiles obey him without a tremor. He is the first and the last handshake of the evening — and he will remember both.',
      },
      mate: {
        name: 'Szabó Máté',
        role: 'Sous-Chef',
        origin: 'Hungarian',
        bio: 'Máté is the kitchen’s metronome: he keeps the rhythm while fifty guests’ evenings are prepared at once. His day begins at the dawn market and ends with the inspection of the final plate. Beside Julien he learned that perfection is not a goal but a method of work.',
      },
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
    csapat: { eyebrow: 'Cocina y Equipo', title: 'Artistas de la *precisión*.' },
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
  team: {
    groupCaption: 'Cuarenta y cinco personas, un solo ritmo: la brigada de EPISTEME.',
    groupAlt: 'El personal del restaurante, de unas cuarenta y cinco personas, en la escalinata de la fachada al anochecer',
    members: {
      julien: {
        name: 'Julien Marchand',
        role: 'Executive Chef',
        origin: 'francés',
        bio: 'Treinta años junto a los fogones, y aún entra en la cocina con la emoción del primer servicio. Para Julien, el gusto no es placer sino conocimiento: cada plato es un pensamiento formulado con precisión. Su cocina es silenciosa; la disciplina es, para él, la forma más alta de la creatividad.',
      },
      alessandro: {
        name: 'Alessandro De Luca',
        role: 'Maître d’hôtel',
        origin: 'italiano',
        bio: 'Alessandro cree que la hospitalidad es un teatro donde la mejor actuación es invisible. Lleva un cuarto de siglo leyendo mesas: una mirada le basta para saber cuándo aparecer y cuándo desvanecerse. Al final de sus veladas, el huésped no se siente atendido, sino comprendido.',
      },
      margaux: {
        name: 'Margaux Fournier',
        role: 'Chef Sommelier',
        origin: 'francesa',
        bio: 'Margaux trata el vino como una historia en la que la añada es solo la primera frase. Su bodega se construye despacio, con paciencia, como la confianza que los huéspedes depositan en ella cada noche. Sus recomendaciones nunca son ostentosas: sirven al plato, al momento y a la persona.',
      },
      reka: {
        name: 'Kovács Réka',
        role: 'Recepción / Hostess',
        origin: 'húngara',
        bio: 'Réka es la primera voz al teléfono y la primera sonrisa en la puerta: EPISTEME comienza con ella. Conoce de memoria los nombres de los huéspedes que regresan, sus mesas e incluso el motivo de sus silencios. Está convencida de que la atención es la forma más rara del lujo.',
      },
      bence: {
        name: 'Nagy Bence',
        role: 'Chef Voiturier',
        origin: 'húngaro',
        bio: 'En manos de Bence, hasta la llegada se vuelve ceremonia: una puerta abierta, un saludo discreto, y el coche desaparece sin ruido en la noche. Automóviles clásicos y contemporáneos le obedecen por igual, sin un temblor. Es el primero y el último apretón de manos de la velada, y recordará ambos.',
      },
      mate: {
        name: 'Szabó Máté',
        role: 'Sous-Chef',
        origin: 'húngaro',
        bio: 'Máté es el metrónomo de la cocina: mantiene el ritmo cuando las veladas de cincuenta huéspedes se preparan a la vez. Su día empieza en el mercado al alba y termina con la revisión del último plato. Junto a Julien aprendió que la perfección no es una meta, sino un método de trabajo.',
      },
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

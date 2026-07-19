export type Lang = 'hu' | 'en' | 'es';

/** Every menu item id; Record<MenuItemId, …> forces all 47 items to exist in each language. */
export type MenuItemId =
  | 'osztriga' | 'fugu'
  | 'kaviar' | 'kobe-carpaccio' | 'jamon' | 'foie-gras' | 'lazac-tartar'
  | 'fesukagylo' | 'libamaj' | 'wagyu-ravioli'
  | 'fecskefeszek' | 'homar-bisque' | 'szarvasgomba-leves'
  | 'homar-rizotto' | 'tonhal-steak' | 'tengeri-suger' | 'tokhal'
  | 'wagyu-chateaubriand' | 'matsusaka' | 'poulet-bresse' | 'kurobuta' | 'barany'
  | 'pule' | 'epoisses'
  | 'golden-opulence' | 'yubari-parfe' | 'macaron' | 'szufle' | 'tiramisu'
  | 'acqua-di-cristallo' | 'svalbardi' | 'fillico'
  | 'black-ivory' | 'kopi-luwak' | 'da-hong-pao' | 'gyokuro'
  | 'armand-midas' | 'dom-perignon-rose' | 'salon'
  | 'yquem-1811' | 'screaming-eagle' | 'drc'
  | 'henri-iv' | 'macallan-1926' | 'louis-xiii' | 'diamonds-martini' | 'the-winston';

export type MenuItemText = { name: string; desc: string };

export type MenuCategoryKey =
  | 'amuse' | 'cold' | 'warm' | 'soup' | 'seafood' | 'meat' | 'cheese' | 'dessert'
  | 'water' | 'coffee' | 'champagne' | 'wine' | 'spirit';

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
  menu: {
    chefsSelection: string;
    categories: Record<MenuCategoryKey, string>;
    suffixes: { portion: string; twoPersons: string };
    items: Record<MenuItemId, MenuItemText>;
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
    etlap: { eyebrow: 'Az étlap', title: 'Egy este. Ezer *finomság*.' },
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
  menu: {
    chefsSelection: 'Séf ajánlása',
    categories: {
      amuse: 'Amuse-Bouche',
      cold: 'Hideg előételek',
      warm: 'Meleg előételek',
      soup: 'Levesek',
      seafood: 'Főételek — Tenger gyümölcsei',
      meat: 'Főételek — Húsok',
      cheese: 'Sajtok',
      dessert: 'Desszertek',
      water: 'Vizek',
      coffee: 'Kávé & Tea',
      champagne: 'Pezsgők',
      wine: 'Borok',
      spirit: 'Párlatok & Koktélok',
    },
    suffixes: { portion: '/ adag', twoPersons: '/ 2 fő' },
    items: {
      osztriga: {
        name: 'Cozes-i Osztriga „Perle Noire”',
        desc: 'Nyers osztriga Cozes partjairól, keserűcsokoládé-csipkével és fekete gyöngyként csillanó kaviárcseppel.',
      },
      fugu: {
        name: 'Fugu Sashimi Falat',
        desc: 'Engedélyes mester által papírvékonyra szeletelt fugu, ponzuval és frissen reszelt wasabival.',
      },
      kaviar: {
        name: 'Almás Kaviár Blinivel',
        desc: 'Ötven gramm szemenként pergő kaviár zöldalma-esszenciával, hajdina-blinivel és crème fraîche-sel.',
      },
      'kobe-carpaccio': {
        name: 'Kobe Marha Carpaccio',
        desc: 'Leheletvékony Kobe-szeletek hidegen sajtolt olívaolajjal, érlelt parmezánforgáccsal és tört borssal.',
      },
      jamon: {
        name: 'Jamón Ibérico de Bellota',
        desc: 'Makkon hizlalt ibériai sonka, negyvennyolc hónapig érlelve, kézzel szeletelve az asztal mellett.',
      },
      'foie-gras': {
        name: 'Terrine de Foie Gras d’Oie',
        desc: 'Lassan sült libamáj-terrine Sauternes-zselével, birsalmalekvárral és pirított briós-szeletekkel.',
      },
      'lazac-tartar': {
        name: 'Ōra King Lazac Tartár',
        desc: 'Kézzel vágott Ōra King lazac yuzuval, tengeri spárgával és füstölt tojássárgája-krémmel.',
      },
      fesukagylo: {
        name: 'Hokkaido Fésűkagyló',
        desc: 'Vajban karamellizált hokkaidói fésűkagyló barnavaj-emulzióval és shiso-olajjal, héjában tálalva.',
      },
      libamaj: {
        name: 'Serpenyős Libamáj',
        desc: 'Roséra pirított libamáj sült körtével, tokaji borredukcióval és ropogós kaláccsal.',
      },
      'wagyu-ravioli': {
        name: 'Wagyu-Szarvasgomba Ravioli',
        desc: 'Kézzel hajtogatott ravioli lassan párolt wagyuval töltve, fekete szarvasgombával és csontvelő-glásszal.',
      },
      fecskefeszek: {
        name: 'Fecskefészek Leves',
        desc: 'A hagyományos kínai ínyencség kristálytiszta szárnyas-consomméban, aranyszínű krutonnal.',
      },
      'homar-bisque': {
        name: 'Kék Homár Bisque',
        desc: 'Bársonyos bisque bretagne-i kék homárból, konyakkal flambírozva, tárkonyos tejszínhabbal.',
      },
      'szarvasgomba-leves': {
        name: 'Fehér Szarvasgomba Krémleves',
        desc: 'Selymes krémleves alba-i fehér szarvasgombával, pirított mogyoróval és szarvasgombaolaj-cseppekkel.',
      },
      'homar-rizotto': {
        name: 'Kék Homár Sáfrányos Rizottóval',
        desc: 'Vajban posírozott kék homár carnaroli rizottón, sáfránnyal és homár-bisque-glásszal.',
      },
      'tonhal-steak': {
        name: 'O-Toro Tonhal Steak',
        desc: 'A kékúszójú tonhal legzsírosabb hasaszelete: kívül pirítva, belül rozé, szezám-ponzu mázzal.',
      },
      'tengeri-suger': {
        name: 'Glacier 51 Tengeri Sügér',
        desc: 'Az Antarktisz jeges vizeiből: hófehér húsa vajpuhán omlik, yuzus beurre blanc-nal.',
      },
      tokhal: {
        name: 'Beluga Tokhal Filé',
        desc: 'Lassan sült beluga tokhalfilé saját kaviárjával koronázva, jégen tálalt pezsgő-veluttal.',
      },
      'wagyu-chateaubriand': {
        name: 'A5 Wagyu Chateaubriand Aranykéregben',
        desc: 'A5-ös wagyu bélszín ehető aranykéregben sütve, füstölt csontvelő-jus-vel, az asztalnál szeletelve.',
      },
      matsusaka: {
        name: 'Matsusaka Sirloin',
        desc: 'A világ legmárványozottabb marhahúsa binchotan faszén felett grillezve, csupán tengeri sóval.',
      },
      'poulet-bresse': {
        name: 'Poulet de Bresse',
        desc: 'Egészben sütött bresse-i csirke vin jaune-mártással és frissen gyalult szarvasgombával, két főre.',
      },
      kurobuta: {
        name: 'Kurobuta Sertés Császár',
        desc: 'Berkshire-i fekete sertés császárhúsa üvegesre sült bőrrel, misókaramellel és füstölt burgonyapürével.',
      },
      barany: {
        name: 'Új-Zélandi Báránygerinc',
        desc: 'Füvön nevelt bárány gerince rozmaringkéregben, fekete fokhagymával és mély bárány-jus-vel.',
      },
      pule: {
        name: 'Pule Sajt',
        desc: 'A világ legritkább sajtja szerbiai szamártejből — huszonöt liter tej egyetlen kilóhoz.',
      },
      epoisses: {
        name: 'Époisses de Bourgogne',
        desc: 'Marc de Bourgogne-nyal mosott kérgű, krémesen folyó burgundi sajt dióval és fügével.',
      },
      'golden-opulence': {
        name: 'Golden Opulence Kehely',
        desc: 'Tahiti vaníliafagylalt 23 karátos aranyfüsttel, Amedei-csokoládéval és kandírozott gyümölccsel, kristálykehelyben.',
      },
      'yubari-parfe': {
        name: 'Yubari King Dinnye Parfé',
        desc: 'Japán Yubari King dinnye jéghideg parfévá dermesztve, friss dinnyeszeletekkel és shisóval.',
      },
      macaron: {
        name: 'Szarvasgombás-Arany Macaron',
        desc: 'Fekete szarvasgombás ganache ropogós makaronhéjban, ehető aranyporral fújva.',
      },
      szufle: {
        name: 'Amedei Porcelana Szuflé',
        desc: 'Levegős szuflé a ritka Porcelana-kakaóból, folyékony közepével, abban a pillanatban tálalva, amikor felemelkedik.',
      },
      tiramisu: {
        name: 'Kopi Luwak Tiramisu',
        desc: 'Klasszikus tiramisu kopi luwak kávéval átitatva, mascarponéval és kakaóval rétegezve.',
      },
      'acqua-di-cristallo': {
        name: 'Acqua di Cristallo Tributo a Modigliani',
        desc: 'Fidzsi- és francia forrásvizek házasítása 24 karátos aranyszórással, kézzel formált üvegben.',
      },
      svalbardi: {
        name: 'Svalbarði Polar Iceberg Water',
        desc: 'Svalbard sarkvidéki jéghegyeiből olvasztva — négyezer éves, érintetlen tisztaság.',
      },
      fillico: {
        name: 'Fillico Jewelry Water',
        desc: 'Kobe forrásvize Swarovski-kristályokkal díszített, koronás palackban.',
      },
      'black-ivory': {
        name: 'Black Ivory Coffee',
        desc: 'Thaiföldi arabica, elefántok által természetesen fermentálva — a világ legritkább kávéja.',
      },
      'kopi-luwak': {
        name: 'Kopi Luwak Kávé',
        desc: 'Vadon élő cibetmacskák válogatta szumátrai szemek, lágy, csokoládés karakterrel.',
      },
      'da-hong-pao': {
        name: 'Da Hong Pao Tea',
        desc: 'Oolong a Wuyi-hegység anyateáiról szaporított bokrokról — mély, ásványos, hosszú lecsengés.',
      },
      gyokuro: {
        name: 'Gyokuro Tea',
        desc: 'Árnyékban nevelt japán zöld tea: selymes umami és édes, tengeri frissesség.',
      },
      'armand-midas': {
        name: 'Armand de Brignac Midas',
        desc: 'Harmincliteres aranypalack — a ház nagy házasítása, monumentális formában.',
      },
      'dom-perignon-rose': {
        name: 'Dom Pérignon Rosé Gold',
        desc: 'Vintage rozé aranyba öltöztetett palackban: érett piros gyümölcs és füst.',
      },
      salon: {
        name: 'Salon Blanc de Blancs',
        desc: 'Chardonnay egyetlen falu, Le Mesnil-sur-Oger krétadombjairól — csak nagy évjáratokban készül.',
      },
      'yquem-1811': {
        name: 'Château d’Yquem 1811',
        desc: 'A legendás „üstökös-évjárat” Sauternes-ből — két évszázad napfénye mézzé érve.',
      },
      'screaming-eagle': {
        name: 'Screaming Eagle',
        desc: 'Napa Valley kultikus cabernet-je — parányi termés, fekete gyümölcs, bársonyos erő.',
      },
      drc: {
        name: 'DRC Grand Cru',
        desc: 'Pinot noir Burgundia szívéből, a Romanée-Conti birtokról — éteri illat, selymes tannin.',
      },
      'henri-iv': {
        name: 'Henri IV Dudognon Cognac',
        desc: 'Száz évig tölgyfahordóban érlelt cognac-örökség, aranyba és kristályba zárva.',
      },
      'macallan-1926': {
        name: 'Macallan 1926',
        desc: 'Hatvan évig érlelt single malt az 1926-os lepárlásból — a whiskytörténelem csúcsa.',
      },
      'louis-xiii': {
        name: 'Louis XIII Black Pearl',
        desc: 'Grande Champagne-i eaux-de-vie házasítása éjfekete kristálydekanterben.',
      },
      'diamonds-martini': {
        name: '„Diamonds Are Forever” Martini',
        desc: 'Jéghideg vodka-martini, amelynek mélyén valódi gyémánt csillog.',
      },
      'the-winston': {
        name: '„The Winston”',
        desc: 'Évszázados konyakokra épített koktél füstölt fűszerekkel — türelemmel kevert ritkaság.',
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
    etlap: { eyebrow: 'The menu', title: 'One evening. A thousand *refinements*.' },
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
  menu: {
    chefsSelection: 'Chef’s Selection',
    categories: {
      amuse: 'Amuse-Bouche',
      cold: 'Cold Starters',
      warm: 'Warm Starters',
      soup: 'Soups',
      seafood: 'Mains — From the Sea',
      meat: 'Mains — Meat & Poultry',
      cheese: 'Cheeses',
      dessert: 'Desserts',
      water: 'Waters',
      coffee: 'Coffee & Tea',
      champagne: 'Champagnes',
      wine: 'Wines',
      spirit: 'Spirits & Cocktails',
    },
    suffixes: { portion: '/ portion', twoPersons: '/ 2 pers.' },
    items: {
      osztriga: {
        name: 'Cozes Oyster “Perle Noire”',
        desc: 'Raw oyster from the Cozes coast, laced with bitter-chocolate filigree and a black pearl of caviar.',
      },
      fugu: {
        name: 'Fugu Sashimi Bite',
        desc: 'Fugu sliced paper-thin by a licensed master, with ponzu and freshly grated wasabi.',
      },
      kaviar: {
        name: 'Apple Caviar with Blini',
        desc: 'Fifty grams of pearl-firm caviar with green-apple essence, buckwheat blini and crème fraîche.',
      },
      'kobe-carpaccio': {
        name: 'Kobe Beef Carpaccio',
        desc: 'Whisper-thin slices of Kobe beef with cold-pressed olive oil, aged Parmesan shavings and cracked pepper.',
      },
      jamon: {
        name: 'Jamón Ibérico de Bellota',
        desc: 'Acorn-fed Ibérico ham cured for forty-eight months, carved by hand beside the table.',
      },
      'foie-gras': {
        name: 'Terrine de Foie Gras d’Oie',
        desc: 'Slow-baked goose foie gras terrine with Sauternes jelly, quince preserve and toasted brioche.',
      },
      'lazac-tartar': {
        name: 'Ōra King Salmon Tartare',
        desc: 'Hand-cut Ōra King salmon with yuzu, sea asparagus and smoked egg-yolk cream.',
      },
      fesukagylo: {
        name: 'Hokkaido Scallop',
        desc: 'Hokkaido scallop caramelised in butter, brown-butter emulsion and shiso oil, served in its shell.',
      },
      libamaj: {
        name: 'Pan-Seared Goose Liver',
        desc: 'Goose liver seared to rosé with roasted pear, a Tokaji wine reduction and crisp brioche.',
      },
      'wagyu-ravioli': {
        name: 'Wagyu & Truffle Ravioli',
        desc: 'Hand-folded ravioli of slow-braised Wagyu with black truffle and a bone-marrow glaze.',
      },
      fecskefeszek: {
        name: 'Bird’s Nest Soup',
        desc: 'The classic Chinese delicacy in a crystal-clear poultry consommé with golden croutons.',
      },
      'homar-bisque': {
        name: 'Blue Lobster Bisque',
        desc: 'A velvet bisque of Brittany blue lobster, flambéed with cognac, tarragon cream.',
      },
      'szarvasgomba-leves': {
        name: 'White Truffle Velouté',
        desc: 'A silken velouté of white Alba truffle with toasted hazelnuts and drops of truffle oil.',
      },
      'homar-rizotto': {
        name: 'Blue Lobster with Saffron Risotto',
        desc: 'Butter-poached blue lobster on Carnaroli risotto with saffron and a lobster-bisque glaze.',
      },
      'tonhal-steak': {
        name: 'O-Toro Tuna Steak',
        desc: 'The richest cut of bluefin belly: seared outside, rosé within, sesame-ponzu glaze.',
      },
      'tengeri-suger': {
        name: 'Glacier 51 Sea Bass',
        desc: 'From Antarctic waters: snow-white flesh that parts like butter, with a yuzu beurre blanc.',
      },
      tokhal: {
        name: 'Beluga Sturgeon Fillet',
        desc: 'Slow-roasted Beluga sturgeon crowned with its own caviar, champagne velouté over ice.',
      },
      'wagyu-chateaubriand': {
        name: 'A5 Wagyu Chateaubriand in Gold Crust',
        desc: 'A5 Wagyu tenderloin roasted in an edible gold crust, smoked bone-marrow jus, carved tableside.',
      },
      matsusaka: {
        name: 'Matsusaka Sirloin',
        desc: 'The world’s most marbled beef, grilled over binchotan charcoal with nothing but sea salt.',
      },
      'poulet-bresse': {
        name: 'Poulet de Bresse',
        desc: 'Whole-roasted Bresse chicken with vin jaune sauce and freshly shaved truffle, for two.',
      },
      kurobuta: {
        name: 'Kurobuta Pork Belly',
        desc: 'Berkshire black pork belly with glass-crisp crackling, miso caramel and smoked potato purée.',
      },
      barany: {
        name: 'New Zealand Rack of Lamb',
        desc: 'Grass-fed lamb rack in a rosemary crust with black garlic and a deep lamb jus.',
      },
      pule: {
        name: 'Pule Cheese',
        desc: 'The world’s rarest cheese, from Serbian donkey milk — twenty-five litres for a single kilo.',
      },
      epoisses: {
        name: 'Époisses de Bourgogne',
        desc: 'Burgundy cheese washed in Marc de Bourgogne, creamily molten, with walnuts and fig.',
      },
      'golden-opulence': {
        name: 'Golden Opulence Sundae',
        desc: 'Tahitian vanilla ice cream with 23-carat gold leaf, Amedei chocolate and candied fruit, in crystal.',
      },
      'yubari-parfe': {
        name: 'Yubari King Melon Parfait',
        desc: 'Japan’s Yubari King melon set into an ice-cold parfait with fresh slices and shiso.',
      },
      macaron: {
        name: 'Truffle & Gold Macaron',
        desc: 'Black-truffle ganache in a crisp macaron shell, dusted with edible gold.',
      },
      szufle: {
        name: 'Amedei Porcelana Soufflé',
        desc: 'An airy soufflé of rare Porcelana cacao, molten at its heart, served the moment it rises.',
      },
      tiramisu: {
        name: 'Kopi Luwak Tiramisu',
        desc: 'Classic tiramisu soaked in kopi luwak coffee, layered with mascarpone and cocoa.',
      },
      'acqua-di-cristallo': {
        name: 'Acqua di Cristallo Tributo a Modigliani',
        desc: 'A marriage of Fiji and French spring waters with 24-carat gold dust, in hand-crafted glass.',
      },
      svalbardi: {
        name: 'Svalbarði Polar Iceberg Water',
        desc: 'Melted from Arctic icebergs off Svalbard — four-thousand-year-old, untouched purity.',
      },
      fillico: {
        name: 'Fillico Jewelry Water',
        desc: 'Spring water from Kobe in a crown-topped bottle set with Swarovski crystals.',
      },
      'black-ivory': {
        name: 'Black Ivory Coffee',
        desc: 'Thai arabica naturally fermented by elephants — the world’s rarest coffee.',
      },
      'kopi-luwak': {
        name: 'Kopi Luwak Coffee',
        desc: 'Sumatran beans selected by wild civets: soft, chocolate-toned character.',
      },
      'da-hong-pao': {
        name: 'Da Hong Pao Tea',
        desc: 'Oolong from bushes descended from the Wuyi mother trees — deep, mineral, endless finish.',
      },
      gyokuro: {
        name: 'Gyokuro Tea',
        desc: 'Shade-grown Japanese green tea: silken umami and a sweet marine freshness.',
      },
      'armand-midas': {
        name: 'Armand de Brignac Midas',
        desc: 'A thirty-litre golden Midas — the house’s grand blend at monumental scale.',
      },
      'dom-perignon-rose': {
        name: 'Dom Pérignon Rosé Gold',
        desc: 'Vintage rosé in a gold-dressed bottle: ripe red fruit and smoke.',
      },
      salon: {
        name: 'Salon Blanc de Blancs',
        desc: 'Chardonnay from the chalk of a single village, Le Mesnil-sur-Oger — made only in great years.',
      },
      'yquem-1811': {
        name: 'Château d’Yquem 1811',
        desc: 'The legendary “comet vintage” of Sauternes — two centuries of sunlight turned to honey.',
      },
      'screaming-eagle': {
        name: 'Screaming Eagle',
        desc: 'Napa Valley’s cult Cabernet — a tiny harvest of black fruit and velvet power.',
      },
      drc: {
        name: 'DRC Grand Cru',
        desc: 'Pinot Noir from the heart of Burgundy, the Romanée-Conti estate — ethereal perfume, silken tannin.',
      },
      'henri-iv': {
        name: 'Henri IV Dudognon Cognac',
        desc: 'A cognac heritage aged one hundred years in oak, sealed in gold and crystal.',
      },
      'macallan-1926': {
        name: 'Macallan 1926',
        desc: 'Single malt aged sixty years from the 1926 distillation — the summit of whisky history.',
      },
      'louis-xiii': {
        name: 'Louis XIII Black Pearl',
        desc: 'A blend of Grande Champagne eaux-de-vie in a night-black crystal decanter.',
      },
      'diamonds-martini': {
        name: '“Diamonds Are Forever” Martini',
        desc: 'An ice-cold vodka martini with a genuine diamond glittering at its base.',
      },
      'the-winston': {
        name: '“The Winston”',
        desc: 'A cocktail built on century-old cognacs with smoked spices — a rarity stirred with patience.',
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
    etlap: { eyebrow: 'La carta', title: 'Una noche. Mil *refinamientos*.' },
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
  menu: {
    chefsSelection: 'Selección del Chef',
    categories: {
      amuse: 'Amuse-Bouche',
      cold: 'Entrantes fríos',
      warm: 'Entrantes calientes',
      soup: 'Sopas',
      seafood: 'Principales — Del mar',
      meat: 'Principales — Carnes y aves',
      cheese: 'Quesos',
      dessert: 'Postres',
      water: 'Aguas',
      coffee: 'Café y té',
      champagne: 'Champanes',
      wine: 'Vinos',
      spirit: 'Destilados y cócteles',
    },
    suffixes: { portion: '/ porción', twoPersons: '/ 2 personas' },
    items: {
      osztriga: {
        name: 'Ostra de Cozes «Perle Noire»',
        desc: 'Ostra cruda de la costa de Cozes, con filigrana de chocolate amargo y una perla negra de caviar.',
      },
      fugu: {
        name: 'Bocado de Sashimi de Fugu',
        desc: 'Fugu en láminas finísimas cortado por un maestro certificado, con ponzu y wasabi recién rallado.',
      },
      kaviar: {
        name: 'Caviar de Manzana con Blinis',
        desc: 'Cincuenta gramos de caviar firme como perlas, esencia de manzana verde, blinis de alforfón y crème fraîche.',
      },
      'kobe-carpaccio': {
        name: 'Carpaccio de Buey de Kobe',
        desc: 'Láminas finísimas de buey de Kobe con aceite de oliva prensado en frío, parmesano curado y pimienta.',
      },
      jamon: {
        name: 'Jamón Ibérico de Bellota',
        desc: 'Jamón de bellota curado cuarenta y ocho meses, cortado a cuchillo junto a la mesa.',
      },
      'foie-gras': {
        name: 'Terrine de Foie Gras d’Oie',
        desc: 'Terrina de foie de oca horneada lentamente, gelatina de Sauternes, membrillo y brioche tostado.',
      },
      'lazac-tartar': {
        name: 'Tartar de Salmón Ōra King',
        desc: 'Salmón Ōra King cortado a mano con yuzu, espárrago de mar y crema de yema ahumada.',
      },
      fesukagylo: {
        name: 'Vieira de Hokkaido',
        desc: 'Vieira de Hokkaido caramelizada en mantequilla, emulsión de mantequilla avellana y aceite de shiso, en su concha.',
      },
      libamaj: {
        name: 'Hígado de Oca a la Sartén',
        desc: 'Hígado de oca al punto rosado con pera asada, reducción de vino de Tokaj y brioche crujiente.',
      },
      'wagyu-ravioli': {
        name: 'Raviolis de Wagyu y Trufa',
        desc: 'Raviolis plegados a mano rellenos de wagyu estofado, trufa negra y glasa de tuétano.',
      },
      fecskefeszek: {
        name: 'Sopa de Nido de Golondrina',
        desc: 'El clásico manjar chino en un consomé de ave cristalino con crutones dorados.',
      },
      'homar-bisque': {
        name: 'Bisque de Bogavante Azul',
        desc: 'Bisque aterciopelada de bogavante azul de Bretaña, flambeada con coñac y nata de estragón.',
      },
      'szarvasgomba-leves': {
        name: 'Crema de Trufa Blanca',
        desc: 'Crema sedosa de trufa blanca de Alba con avellanas tostadas y gotas de aceite de trufa.',
      },
      'homar-rizotto': {
        name: 'Bogavante Azul con Risotto al Azafrán',
        desc: 'Bogavante azul pochado en mantequilla sobre risotto Carnaroli, azafrán y glasa de su bisque.',
      },
      'tonhal-steak': {
        name: 'Filete de Atún O-Toro',
        desc: 'El corte más graso de la ventresca de atún rojo: dorado por fuera, rosado por dentro, glasa de sésamo y ponzu.',
      },
      'tengeri-suger': {
        name: 'Lubina Austral Glacier 51',
        desc: 'De aguas antárticas: carne blanquísima que se deshace como mantequilla, con beurre blanc de yuzu.',
      },
      tokhal: {
        name: 'Filete de Esturión Beluga',
        desc: 'Esturión beluga asado lentamente, coronado con su propio caviar y velouté de champán sobre hielo.',
      },
      'wagyu-chateaubriand': {
        name: 'Chateaubriand de Wagyu A5 en Corteza de Oro',
        desc: 'Solomillo de wagyu A5 asado en corteza de oro comestible, jugo de tuétano ahumado, trinchado en la mesa.',
      },
      matsusaka: {
        name: 'Matsusaka Sirloin',
        desc: 'La carne más veteada del mundo, a la brasa de carbón binchotan, solo con sal marina.',
      },
      'poulet-bresse': {
        name: 'Poulet de Bresse',
        desc: 'Pollo de Bresse asado entero con salsa de vin jaune y trufa recién laminada, para dos.',
      },
      kurobuta: {
        name: 'Panceta de Cerdo Kurobuta',
        desc: 'Panceta de cerdo negro Berkshire con corteza cristalina, caramelo de miso y puré de patata ahumado.',
      },
      barany: {
        name: 'Carré de Cordero de Nueva Zelanda',
        desc: 'Carré de cordero de pasto en costra de romero, ajo negro y un jugo profundo de cordero.',
      },
      pule: {
        name: 'Queso Pule',
        desc: 'El queso más raro del mundo, de leche de burra serbia: veinticinco litros por un solo kilo.',
      },
      epoisses: {
        name: 'Époisses de Bourgogne',
        desc: 'Queso borgoñón lavado con Marc de Bourgogne, cremoso y fundente, con nueces e higo.',
      },
      'golden-opulence': {
        name: 'Copa Golden Opulence',
        desc: 'Helado de vainilla de Tahití con pan de oro de 23 quilates, chocolate Amedei y fruta confitada, en cristal.',
      },
      'yubari-parfe': {
        name: 'Parfait de Melón Yubari King',
        desc: 'Melón japonés Yubari King en parfait helado, con láminas frescas y shiso.',
      },
      macaron: {
        name: 'Macarón de Trufa y Oro',
        desc: 'Ganache de trufa negra en concha crujiente de macarón, espolvoreado con oro comestible.',
      },
      szufle: {
        name: 'Suflé Amedei Porcelana',
        desc: 'Suflé etéreo del raro cacao Porcelana, de corazón fundente, servido en el instante en que sube.',
      },
      tiramisu: {
        name: 'Tiramisú Kopi Luwak',
        desc: 'Tiramisú clásico embebido en café kopi luwak, en capas de mascarpone y cacao.',
      },
      'acqua-di-cristallo': {
        name: 'Acqua di Cristallo Tributo a Modigliani',
        desc: 'Ensamblaje de aguas de manantial de Fiyi y Francia con polvo de oro de 24 quilates, en vidrio artesanal.',
      },
      svalbardi: {
        name: 'Svalbarði Polar Iceberg Water',
        desc: 'Fundida de icebergs árticos de Svalbard: pureza intacta de cuatro mil años.',
      },
      fillico: {
        name: 'Fillico Jewelry Water',
        desc: 'Agua de manantial de Kobe en botella coronada, engastada con cristales de Swarovski.',
      },
      'black-ivory': {
        name: 'Black Ivory Coffee',
        desc: 'Arábica tailandés fermentado naturalmente por elefantes: el café más raro del mundo.',
      },
      'kopi-luwak': {
        name: 'Café Kopi Luwak',
        desc: 'Granos de Sumatra seleccionados por civetas salvajes: carácter suave y achocolatado.',
      },
      'da-hong-pao': {
        name: 'Té Da Hong Pao',
        desc: 'Oolong de arbustos descendientes de los árboles madre de Wuyi: profundo, mineral, final interminable.',
      },
      gyokuro: {
        name: 'Té Gyokuro',
        desc: 'Té verde japonés cultivado a la sombra: umami sedoso y frescura marina dulce.',
      },
      'armand-midas': {
        name: 'Armand de Brignac Midas',
        desc: 'Botella dorada de treinta litros: el gran ensamblaje de la casa a escala monumental.',
      },
      'dom-perignon-rose': {
        name: 'Dom Pérignon Rosé Gold',
        desc: 'Rosado vintage en botella vestida de oro: fruta roja madura y humo.',
      },
      salon: {
        name: 'Salon Blanc de Blancs',
        desc: 'Chardonnay de la creta de un solo pueblo, Le Mesnil-sur-Oger, solo en grandes añadas.',
      },
      'yquem-1811': {
        name: 'Château d’Yquem 1811',
        desc: 'La legendaria «añada del cometa» de Sauternes: dos siglos de sol convertidos en miel.',
      },
      'screaming-eagle': {
        name: 'Screaming Eagle',
        desc: 'El Cabernet de culto de Napa Valley: cosecha mínima, fruta negra, fuerza aterciopelada.',
      },
      drc: {
        name: 'DRC Grand Cru',
        desc: 'Pinot noir del corazón de Borgoña, del dominio de la Romanée-Conti: perfume etéreo, tanino de seda.',
      },
      'henri-iv': {
        name: 'Henri IV Dudognon Cognac',
        desc: 'Herencia de coñac envejecida cien años en roble, sellada en oro y cristal.',
      },
      'macallan-1926': {
        name: 'Macallan 1926',
        desc: 'Single malt de sesenta años de la destilación de 1926: la cumbre de la historia del whisky.',
      },
      'louis-xiii': {
        name: 'Louis XIII Black Pearl',
        desc: 'Ensamblaje de aguardientes de Grande Champagne en un decantador de cristal negro.',
      },
      'diamonds-martini': {
        name: 'Martini «Diamonds Are Forever»',
        desc: 'Martini de vodka helado con un diamante auténtico brillando en el fondo.',
      },
      'the-winston': {
        name: '«The Winston»',
        desc: 'Cóctel sobre coñacs centenarios con especias ahumadas: una rareza mezclada con paciencia.',
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

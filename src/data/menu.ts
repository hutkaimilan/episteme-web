export type Dish = {
  id: string;
  image?: string;            // '/images/menu/xy.png' — omit for drinks
  price: string;              // exact price string, e.g. '150 €'
  chefsSelection?: boolean;
  category: 'amuse'|'cold'|'warm'|'soup'|'seafood'|'meat'|'cheese'|'dessert'|'water'|'coffee'|'champagne'|'wine'|'spirit';
  nameKey: string;
  descKey: string;
};

export const categoryOrder: Dish['category'][] = ['amuse','cold','warm','soup','seafood','meat','cheese','dessert','water','coffee','champagne','wine','spirit'];

/** Categories rendered as image cards; the rest render as a typographic drinks list. */
export const foodCategories: Dish['category'][] = ['amuse','cold','warm','soup','seafood','meat','cheese','dessert'];

const item = (
  id: string,
  category: Dish['category'],
  price: string,
  image?: string,
  chefsSelection?: boolean,
): Dish => ({
  id,
  category,
  price,
  ...(image ? { image: `/images/menu/${image}` } : {}),
  ...(chefsSelection ? { chefsSelection: true } : {}),
  nameKey: `menu.items.${id}.name`,
  descKey: `menu.items.${id}.desc`,
});

export const dishes: Dish[] = [
  // Amuse-bouche
  item('osztriga', 'amuse', '150 €', 'osztriga.png', true),
  item('fugu', 'amuse', '200 €', 'fugu.png'),

  // Cold starters
  item('kaviar', 'cold', '15 000 € / 50g', 'kaviar.png', true),
  item('kobe-carpaccio', 'cold', '850 €', 'kobe-carpaccio.png'),
  item('jamon', 'cold', '450 €', 'jamon.png'),
  item('foie-gras', 'cold', '400 €', 'foie-gras.png'),
  item('lazac-tartar', 'cold', '350 €', 'lazac-tartar.png'),

  // Warm starters
  item('fesukagylo', 'warm', '480 €', 'fesukagylo.png', true),
  item('libamaj', 'warm', '380 €', 'libamaj.png'),
  item('wagyu-ravioli', 'warm', '550 €', 'wagyu-ravioli.png'),

  // Soups
  item('fecskefeszek', 'soup', '600 €', 'fecskefeszek.png'),
  item('homar-bisque', 'soup', '450 €', 'homar-bisque.png'),
  item('szarvasgomba-leves', 'soup', '500 €', 'szarvasgomba-leves.png', true),

  // Mains — from the sea
  item('homar-rizotto', 'seafood', '1200 €', 'homar-rizotto.png'),
  item('tonhal-steak', 'seafood', '950 €', 'tonhal-steak.png'),
  item('tengeri-suger', 'seafood', '750 €', 'tengeri-suger.png'),
  item('tokhal', 'seafood', '1100 €', 'tokhal.png'),

  // Mains — meat & poultry
  item('wagyu-chateaubriand', 'meat', '1800 €', 'wagyu-chateaubriand.png', true),
  item('matsusaka', 'meat', '2200 €', 'matsusaka.png'),
  item('poulet-bresse', 'meat', '1500 € / 2 fő', 'poulet-bresse.png'),
  item('kurobuta', 'meat', '650 €', 'kurobuta.png'),
  item('barany', 'meat', '700 €', 'barany.png'),

  // Cheeses
  item('pule', 'cheese', '800 € / adag', 'pule.png'),
  item('epoisses', 'cheese', '250 € / adag', 'epoisses.png', true),

  // Desserts
  item('golden-opulence', 'dessert', '1000 €', 'golden-opulence.png', true),
  item('yubari-parfe', 'dessert', '650 €', 'yubari-parfe.png'),
  item('macaron', 'dessert', '450 €', 'macaron.png'),
  item('szufle', 'dessert', '400 €', 'szufle.png'),
  item('tiramisu', 'dessert', '300 €', 'tiramisu.png'),

  // Waters
  item('acqua-di-cristallo', 'water', '60 000 €'),
  item('svalbardi', 'water', '120 €'),
  item('fillico', 'water', '250 €'),

  // Coffee & tea
  item('black-ivory', 'coffee', '150 €'),
  item('kopi-luwak', 'coffee', '100 €'),
  item('da-hong-pao', 'coffee', '2500 €'),
  item('gyokuro', 'coffee', '300 €'),

  // Champagnes
  item('armand-midas', 'champagne', '250 000 €'),
  item('dom-perignon-rose', 'champagne', '50 000 €'),
  item('salon', 'champagne', '2200 €'),

  // Wines
  item('yquem-1811', 'wine', '100 000 €'),
  item('screaming-eagle', 'wine', '45 000 €'),
  item('drc', 'wine', '35 000 €'),

  // Spirits & cocktails
  item('henri-iv', 'spirit', '25 000 €'),
  item('macallan-1926', 'spirit', '50 000 €'),
  item('louis-xiii', 'spirit', '2500 €'),
  item('diamonds-martini', 'spirit', '18 000 €'),
  item('the-winston', 'spirit', '12 500 €'),
];

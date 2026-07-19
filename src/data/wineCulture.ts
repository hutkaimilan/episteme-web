export type WinePairing = {
  id: string;
  labelKey: string;   // short evocative label, e.g. a wine/spirit category name
  noteKey: string;    // one-sentence philosophy/pairing note
};

export const wineCultureHighlights: WinePairing[] = [
  {
    id: 'champagne',
    labelKey: 'wineCulture.highlights.champagne.label',
    noteKey: 'wineCulture.highlights.champagne.note',
  },
  {
    id: 'burgundy',
    labelKey: 'wineCulture.highlights.burgundy.label',
    noteKey: 'wineCulture.highlights.burgundy.note',
  },
  {
    id: 'rare-spirits',
    labelKey: 'wineCulture.highlights.rare-spirits.label',
    noteKey: 'wineCulture.highlights.rare-spirits.note',
  },
];

export const sommelierPortrait = '/images/team/margaux.png';

export type LocationImage = {
  id: string;
  image: string;       // '/images/location/xy.png'
  captionKey: string;  // i18n key — poetic caption shown over the image
  altKey: string;      // i18n key — literal description for accessibility
  size: 'large' | 'medium' | 'small'; // controls grid span
};

export const locationImages: LocationImage[] = [
  {
    id: 'homlokzat',
    image: '/images/location/homlokzat.png',
    captionKey: 'gallery.captions.homlokzat',
    altKey: 'gallery.alts.homlokzat',
    size: 'large',
  },
  {
    id: 'fo-terem',
    image: '/images/location/fo-terem.png',
    captionKey: 'gallery.captions.fo-terem',
    altKey: 'gallery.alts.fo-terem',
    size: 'medium',
  },
  {
    id: 'rooftop-bar',
    image: '/images/location/rooftop-bar.png',
    captionKey: 'gallery.captions.rooftop-bar',
    altKey: 'gallery.alts.rooftop-bar',
    size: 'medium',
  },
  {
    id: 'diszasztal',
    image: '/images/location/diszasztal.png',
    captionKey: 'gallery.captions.diszasztal',
    altKey: 'gallery.alts.diszasztal',
    size: 'small',
  },
  {
    id: 'rooftop-terasz',
    image: '/images/location/rooftop-terasz.png',
    captionKey: 'gallery.captions.rooftop-terasz',
    altKey: 'gallery.alts.rooftop-terasz',
    size: 'large',
  },
  {
    id: 'terasz',
    image: '/images/location/terasz.png',
    captionKey: 'gallery.captions.terasz',
    altKey: 'gallery.alts.terasz',
    size: 'small',
  },
];

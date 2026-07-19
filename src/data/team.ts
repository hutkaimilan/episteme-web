export type TeamMember = {
  id: string;
  image: string;        // '/images/team/xy.png'
  nameKey: string;       // i18n key (actual name, not translated, but routed through i18n for consistency)
  roleKey: string;       // i18n key, translated per language
  originKey: string;     // i18n key, e.g. "francia" / "French" / "francés"
  age: number;
  bioKey: string;        // i18n key, 2-3 sentence bio, translated per language
};

export const teamMembers: TeamMember[] = [
  {
    id: 'julien',
    image: '/images/team/julien.png',
    nameKey: 'team.members.julien.name',
    roleKey: 'team.members.julien.role',
    originKey: 'team.members.julien.origin',
    age: 49,
    bioKey: 'team.members.julien.bio',
  },
  {
    id: 'alessandro',
    image: '/images/team/alessandro.png',
    nameKey: 'team.members.alessandro.name',
    roleKey: 'team.members.alessandro.role',
    originKey: 'team.members.alessandro.origin',
    age: 52,
    bioKey: 'team.members.alessandro.bio',
  },
  {
    id: 'margaux',
    image: '/images/team/margaux.png',
    nameKey: 'team.members.margaux.name',
    roleKey: 'team.members.margaux.role',
    originKey: 'team.members.margaux.origin',
    age: 41,
    bioKey: 'team.members.margaux.bio',
  },
  {
    id: 'reka',
    image: '/images/team/reka.png',
    nameKey: 'team.members.reka.name',
    roleKey: 'team.members.reka.role',
    originKey: 'team.members.reka.origin',
    age: 29,
    bioKey: 'team.members.reka.bio',
  },
  {
    id: 'bence',
    image: '/images/team/bence.png',
    nameKey: 'team.members.bence.name',
    roleKey: 'team.members.bence.role',
    originKey: 'team.members.bence.origin',
    age: 35,
    bioKey: 'team.members.bence.bio',
  },
  {
    id: 'mate',
    image: '/images/team/mate.png',
    nameKey: 'team.members.mate.name',
    roleKey: 'team.members.mate.role',
    originKey: 'team.members.mate.origin',
    age: 36,
    bioKey: 'team.members.mate.bio',
  },
];

export const teamGroupImage = '/images/team/group.png';

import type { AvatarGender } from './types';

export const AVATAR_TOP_TYPES = [
  'ShortHairShortFlat',
  'ShortHairSides',
  'ShortHairTheCaesarSidePart',
  'ShortHairShortRound',
  'LongHairBob',
  'LongHairMiaWallace',
  'LongHairBun',
  'LongHairStraight2',
  'LongHairCurvy',
  'NoHair',
] as const;

export const AVATAR_ACCESSORY_TYPES = [
  'Blank',
  'Round',
  'Prescription01',
  'Prescription02',
  'Wayfarers',
  'Sunglasses',
] as const;

export const AVATAR_HAIR_COLORS = [
  'Black',
  'BrownDark',
  'Brown',
  'Auburn',
  'Blonde',
  'BlondeGolden',
  'Red',
  'SilverGray',
  'Platinum',
] as const;

export const AVATAR_FACIAL_HAIR_TYPES = [
  'Blank',
  'BeardLight',
  'BeardMedium',
  'MoustacheFancy',
  'MoustacheMagnum',
] as const;

export const AVATAR_CLOTHE_TYPES = [
  'Hoodie',
  'ShirtCrewNeck',
  'ShirtVNeck',
  'BlazerShirt',
  'BlazerSweater',
  'CollarSweater',
  'GraphicShirt',
] as const;

export const AVATAR_CLOTHE_COLORS = [
  'Black',
  'Blue02',
  'Heather',
  'PastelBlue',
  'PastelGreen',
  'PastelOrange',
  'PastelRed',
  'PastelYellow',
  'Pink',
  'Red',
  'White',
] as const;

export const AVATAR_GRAPHIC_TYPES = [
  'Bear',
  'Hola',
  'Diamond',
  'SkullOutline',
] as const;

export const AVATAR_EYE_TYPES = [
  'Default',
  'Happy',
  'Squint',
  'Wink',
  'Hearts',
  'Surprised',
] as const;

export const AVATAR_EYEBROW_TYPES = [
  'Default',
  'DefaultNatural',
  'RaisedExcitedNatural',
  'FlatNatural',
  'SadConcernedNatural',
  'UpDownNatural',
] as const;

export const AVATAR_MOUTH_TYPES = [
  'Smile',
  'Default',
  'Twinkle',
  'Serious',
  'Sad',
  'Eating',
] as const;

export const AVATAR_SKIN_COLORS = [
  'Pale',
  'Light',
  'Tanned',
  'Brown',
  'DarkBrown',
  'Black',
] as const;

export type AvatarTopType = (typeof AVATAR_TOP_TYPES)[number];
export type AvatarAccessoryType = (typeof AVATAR_ACCESSORY_TYPES)[number];
export type AvatarHairColor = (typeof AVATAR_HAIR_COLORS)[number];
export type AvatarFacialHairType = (typeof AVATAR_FACIAL_HAIR_TYPES)[number];
export type AvatarClotheType = (typeof AVATAR_CLOTHE_TYPES)[number];
export type AvatarClotheColor = (typeof AVATAR_CLOTHE_COLORS)[number];
export type AvatarGraphicType = (typeof AVATAR_GRAPHIC_TYPES)[number];
export type AvatarEyeType = (typeof AVATAR_EYE_TYPES)[number];
export type AvatarEyebrowType = (typeof AVATAR_EYEBROW_TYPES)[number];
export type AvatarMouthType = (typeof AVATAR_MOUTH_TYPES)[number];
export type AvatarSkinColor = (typeof AVATAR_SKIN_COLORS)[number];

export type PulseAvatarAppearance = {
  avatarStyle: 'Transparent';
  topType: AvatarTopType;
  accessoriesType: AvatarAccessoryType;
  hairColor: AvatarHairColor;
  facialHairType: AvatarFacialHairType;
  facialHairColor: AvatarHairColor;
  clotheType: AvatarClotheType;
  clotheColor: AvatarClotheColor;
  graphicType: AvatarGraphicType;
  eyeType: AvatarEyeType;
  eyebrowType: AvatarEyebrowType;
  mouthType: AvatarMouthType;
  skinColor: AvatarSkinColor;
};

const DEFAULT_APPEARANCE_BY_GENDER: Record<AvatarGender, PulseAvatarAppearance> = {
  male: {
    avatarStyle: 'Transparent',
    topType: 'ShortHairTheCaesarSidePart',
    accessoriesType: 'Blank',
    hairColor: 'BrownDark',
    facialHairType: 'BeardLight',
    facialHairColor: 'BrownDark',
    clotheType: 'ShirtCrewNeck',
    clotheColor: 'PastelOrange',
    graphicType: 'Bear',
    eyeType: 'Happy',
    eyebrowType: 'DefaultNatural',
    mouthType: 'Smile',
    skinColor: 'Light',
  },
  female: {
    avatarStyle: 'Transparent',
    topType: 'LongHairMiaWallace',
    accessoriesType: 'Blank',
    hairColor: 'BrownDark',
    facialHairType: 'Blank',
    facialHairColor: 'BrownDark',
    clotheType: 'CollarSweater',
    clotheColor: 'PastelYellow',
    graphicType: 'Bear',
    eyeType: 'Happy',
    eyebrowType: 'RaisedExcitedNatural',
    mouthType: 'Smile',
    skinColor: 'Light',
  },
};

function isOneOf<T extends readonly string[]>(value: unknown, options: T): value is T[number] {
  return typeof value === 'string' && (options as readonly string[]).includes(value);
}

export function createDefaultAvatarAppearance(gender: AvatarGender): PulseAvatarAppearance {
  return { ...DEFAULT_APPEARANCE_BY_GENDER[gender] };
}

export function sanitizeAvatarAppearance(
  input: unknown,
  gender: AvatarGender,
): PulseAvatarAppearance {
  const fallback = createDefaultAvatarAppearance(gender);

  if (!input || typeof input !== 'object') {
    return fallback;
  }

  const value = input as Partial<Record<keyof PulseAvatarAppearance, unknown>>;
  const sanitized: PulseAvatarAppearance = {
    avatarStyle: 'Transparent',
    topType: isOneOf(value.topType, AVATAR_TOP_TYPES) ? value.topType : fallback.topType,
    accessoriesType: isOneOf(value.accessoriesType, AVATAR_ACCESSORY_TYPES)
      ? value.accessoriesType
      : fallback.accessoriesType,
    hairColor: isOneOf(value.hairColor, AVATAR_HAIR_COLORS) ? value.hairColor : fallback.hairColor,
    facialHairType: isOneOf(value.facialHairType, AVATAR_FACIAL_HAIR_TYPES)
      ? value.facialHairType
      : fallback.facialHairType,
    facialHairColor: isOneOf(value.facialHairColor, AVATAR_HAIR_COLORS)
      ? value.facialHairColor
      : fallback.facialHairColor,
    clotheType: isOneOf(value.clotheType, AVATAR_CLOTHE_TYPES)
      ? value.clotheType
      : fallback.clotheType,
    clotheColor: isOneOf(value.clotheColor, AVATAR_CLOTHE_COLORS)
      ? value.clotheColor
      : fallback.clotheColor,
    graphicType: isOneOf(value.graphicType, AVATAR_GRAPHIC_TYPES)
      ? value.graphicType
      : fallback.graphicType,
    eyeType: isOneOf(value.eyeType, AVATAR_EYE_TYPES) ? value.eyeType : fallback.eyeType,
    eyebrowType: isOneOf(value.eyebrowType, AVATAR_EYEBROW_TYPES)
      ? value.eyebrowType
      : fallback.eyebrowType,
    mouthType: isOneOf(value.mouthType, AVATAR_MOUTH_TYPES) ? value.mouthType : fallback.mouthType,
    skinColor: isOneOf(value.skinColor, AVATAR_SKIN_COLORS) ? value.skinColor : fallback.skinColor,
  };

  if (gender === 'female' && sanitized.facialHairType !== 'Blank') {
    sanitized.facialHairType = 'Blank';
  }

  return sanitized;
}

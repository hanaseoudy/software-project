// GEN-08: upload limits
export enum ImageCategory {
  POST = 'post',
  ACTIVITY = 'activity',
  HOTEL = 'hotel',
  AIRLINE = 'airline', // airline logo
}

export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

// max images per owner (post / activity / hotel) and 1 logo per airline
export const MAX_IMAGES: Record<ImageCategory, number> = {
  [ImageCategory.POST]: 5,
  [ImageCategory.ACTIVITY]: 5,
  [ImageCategory.HOTEL]: 5,
  [ImageCategory.AIRLINE]: 1,
};

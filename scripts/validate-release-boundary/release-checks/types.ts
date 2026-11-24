export type ReleaseBoundaryCheck = {
  id: string;
  file: string;
  files?: string[];
  required?: string[];
  forbidden?: string[];
  retired?: boolean;
};

export type ReleaseValidationProfile = 'aggregate' | 'stable' | 'windows';

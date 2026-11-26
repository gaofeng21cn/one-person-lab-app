import { readJson } from '../assertions.ts';
import { productProfilePath, settingsControlPlanePath } from '../validation-config.ts';

export const productProfile = readJson(productProfilePath);
export const settingsControlPlane = readJson(settingsControlPlanePath);

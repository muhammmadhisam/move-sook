import type { Config } from 'tailwindcss';
import preset from '@movesook/config/tailwind';

const config: Config = {
  presets: [preset as Partial<Config>],
  content: [
    './src/**/*.{ts,tsx}',
    // Pull in class names used by the shared UI package.
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
};

export default config;

import { resolve } from 'node:path';

/** The root of this repository, so every path holds whichever directory a command is run from. */
export const ROOT = resolve(import.meta.dirname, '..');

/** The app checkout that gets filmed: whatever it is on (a branch, `main`, a tag) is what is shown. */
export const APP_DIR = process.env.KUBERMEISTER_APP
    ? resolve(process.env.KUBERMEISTER_APP)
    : resolve(ROOT, '../kubermeister');

export const CACHE_DIR = resolve(ROOT, '.cache');
export const OUT_DIR = resolve(ROOT, 'out');

/**
 * Exactly 16:9, so the footage fills the video frame without bars; a Retina display captures it at
 * 3200×1800, which leaves room for the reel's follow zoom to crop in without going soft.
 */
export const WINDOW = { x: 40, y: 40, width: 1600, height: 900 };
export const SCALE = 2;
export const FOOTAGE = { width: WINDOW.width * SCALE, height: WINDOW.height * SCALE };

export const FPS = 30;

export type Theme = 'dark' | 'light';

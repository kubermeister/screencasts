import type { Director } from './director';

export type { Director } from './director';

export interface Scene {
    /** Before the video starts: not filmed. */
    setup?(director: Director): Promise<void>;
    /** The video: marks every beat of the script, in order. */
    run(director: Director): Promise<void>;
    /** After the video ends: not filmed. Back out of anything that would block closing. */
    cleanup?(director: Director): Promise<void>;
}

export function defineScene(scene: Scene): Scene {
    return scene;
}

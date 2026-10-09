import { Composition } from 'remotion';
import brand from '../../brand/brand.json';
import type { Brand, RenderProps } from './timing';
import { Reel } from './Reel';
import { Video } from './Video';

/** Placeholder props: every real render passes its own, and its length, through calculateMetadata. */
const EMPTY: RenderProps = {
    timeline: {
        version: 1,
        footage: { file: 'footage.mp4', width: 3200, height: 1800, fps: 30, durationMs: 1000 },
        scale: 2,
        startEpochMs: 0,
        beats: [],
        anchors: {},
        cursor: [],
    },
    script: { id: 'empty', title: 'Empty', beats: [] },
    theme: 'dark',
    brand: brand as Brand,
    footageUrl: '',
    voice: [],
    durationInFrames: 30,
};

export function Root() {
    const length = ({ props }: { props: RenderProps }) => ({ durationInFrames: props.durationInFrames });
    return (
        <>
            <Composition
                id="Video"
                component={Video}
                width={1920}
                height={1080}
                fps={30}
                durationInFrames={30}
                defaultProps={EMPTY}
                calculateMetadata={length}
            />
            <Composition
                id="Reel"
                component={Reel}
                width={1080}
                height={1920}
                fps={30}
                durationInFrames={30}
                defaultProps={EMPTY}
                calculateMetadata={length}
            />
        </>
    );
}

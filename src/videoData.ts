import input from '../input.json';

export type SceneKind = string;

export type VisualMetaphor =
  | 'street_frame_people'
  | 'museum_faces'
  | 'emotion_icons'
  | 'body_gesture'
  | 'empty_courtyard'
  | 'meaning_vs_real'
  | 'real_face';

export type Scene = {
  id: string;
  kind: SceneKind;
  visualMetaphor: VisualMetaphor;
  visualLabel: string;
  duration: number;
  eyebrow: string;
  title: string;
  body: string;
  note: string;
  accent: 'blue' | 'green' | 'red' | 'ink' | 'pink';
};

export type Narration = {
  enabled: boolean;
  mode?: 'none' | 'full_track';
  audioSrc?: string;
  duration?: number;
  syncMode?: 'scene_sum' | 'fit_audio';
  volume?: number;
  text?: string;
};

export type InputVideo = {
  template: 'handdrawn_reading_coloring_video';
  version: string;
  style: 'children_coloring_page';
  book: {
    title: string;
    chapter?: string;
    author?: string;
  };
  video: {
    width: number;
    height: number;
    fps: number;
    duration?: number;
  };
  narration?: Narration;
  scenes: Scene[];
};

export type VideoConfig = {
  width: number;
  height: number;
  fps: number;
  duration: number;
};

export type ResolvedVideoData = {
  videoConfig: VideoConfig;
  narration?: Narration;
  scenes: Scene[];
};

export const defaultInput = input as InputVideo;

export const resolveVideoData = (typedInput: InputVideo): ResolvedVideoData => {
  const totalDuration = typedInput.scenes.reduce(
    (sum, scene) => sum + scene.duration,
    0,
  );

  const shouldFitAudio =
    typedInput.narration?.enabled === true &&
    typedInput.narration.mode === 'full_track' &&
    typedInput.narration.syncMode === 'fit_audio' &&
    typeof typedInput.narration.duration === 'number' &&
    typedInput.narration.duration > 0;

  const resolvedDuration =
    (shouldFitAudio ? typedInput.narration?.duration : undefined) ??
    typedInput.video.duration ??
    totalDuration;

  const sceneDurationScale =
    shouldFitAudio && totalDuration > 0 ? resolvedDuration / totalDuration : 1;

  return {
    videoConfig: {
      width: typedInput.video.width,
      height: typedInput.video.height,
      fps: typedInput.video.fps,
      duration: resolvedDuration,
    },
    narration: typedInput.narration,
    scenes: typedInput.scenes.map((scene) => ({
      ...scene,
      duration: scene.duration * sceneDurationScale,
    })),
  };
};

const resolvedDefault = resolveVideoData(defaultInput);

export const videoConfig = resolvedDefault.videoConfig;
export const narration = resolvedDefault.narration;
export const scenes = resolvedDefault.scenes;

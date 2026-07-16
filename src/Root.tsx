import React from 'react';
import {Composition, getInputProps} from 'remotion';
import {ColoringPageVideo} from './ColoringPageVideo';
import {SummerExcerptVideo} from './SummerExcerptVideo';
import {
  defaultInput,
  InputVideo,
  resolveVideoData,
} from './videoData';

type RenderProps = {
  input?: InputVideo;
};

const isInputVideo = (value: unknown): value is InputVideo => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<InputVideo>;
  return (
    candidate.template === 'handdrawn_reading_coloring_video' &&
    candidate.style === 'children_coloring_page' &&
    Array.isArray(candidate.scenes)
  );
};

export const RemotionRoot: React.FC = () => {
  const inputProps = getInputProps() as RenderProps | InputVideo;
  const nestedInput = (inputProps as RenderProps).input;
  const inputData = isInputVideo(nestedInput)
    ? nestedInput
    : isInputVideo(inputProps)
      ? inputProps
      : defaultInput;
  const {scenes, videoConfig, narration} = resolveVideoData(inputData);
  const defaultProps = {scenes, videoConfig, narration};

  return (
    <>
      <Composition
        id="SummerExcerptVideo"
        component={SummerExcerptVideo}
        durationInFrames={Math.round(videoConfig.duration * videoConfig.fps)}
        fps={videoConfig.fps}
        width={videoConfig.width}
        height={videoConfig.height}
        defaultProps={defaultProps}
      />
      <Composition
        id="SummerExcerptColoringVideo"
        component={ColoringPageVideo}
        durationInFrames={Math.round(videoConfig.duration * videoConfig.fps)}
        fps={videoConfig.fps}
        width={videoConfig.width}
        height={videoConfig.height}
        defaultProps={defaultProps}
      />
    </>
  );
};

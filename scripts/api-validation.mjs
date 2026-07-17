const assertObject = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
};

const isUnsafeLocalPath = (value) => {
  if (typeof value !== 'string') return false;
  if (/^https?:\/\//i.test(value) || value.startsWith('data:')) return false;
  return (
    value.includes('..') ||
    value.startsWith('file:') ||
    value.startsWith('/') ||
    value.startsWith('\\\\') ||
    /^[a-zA-Z]:[\\/]/.test(value)
  );
};

const checkUnsafeStrings = (value, trail = []) => {
  if (typeof value === 'string') {
    if (isUnsafeLocalPath(value)) {
      throw new Error(`Unsafe local path is not allowed at ${trail.join('.') || 'request'}`);
    }
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => checkUnsafeStrings(item, [...trail, String(index)]));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    checkUnsafeStrings(child, [...trail, key]);
  }
};

export const validateRenderJobRequest = (job) => {
  assertObject(job, 'render job');

  if (Object.prototype.hasOwnProperty.call(job, 'jobId')) {
    throw new Error('Client supplied jobId is not allowed');
  }
  for (const forbidden of ['output', 'outputFile', 'outputDir', 'command', 'cmd', 'shell', 'cwd']) {
    if (Object.prototype.hasOwnProperty.call(job, forbidden)) {
      throw new Error(`Client supplied ${forbidden} is not allowed`);
    }
  }

  if (job.jobType !== 'merge_audio_segments_and_render') {
    throw new Error('jobType must be merge_audio_segments_and_render');
  }

  assertObject(job.audioMerge, 'audioMerge');
  if (job.audioMerge.required !== true) {
    throw new Error('audioMerge.required must be true');
  }
  if (!Array.isArray(job.audioMerge.segments) || job.audioMerge.segments.length < 1) {
    throw new Error('audioMerge.segments must be a non-empty array');
  }

  const seen = new Set();
  for (const [position, segment] of job.audioMerge.segments.entries()) {
    assertObject(segment, `audioMerge.segments[${position}]`);
    if (!Number.isInteger(segment.index) || segment.index < 0) {
      throw new Error(`audioMerge.segments[${position}].index must be a non-negative integer`);
    }
    if (seen.has(segment.index)) {
      throw new Error(`Duplicate audio segment index: ${segment.index}`);
    }
    seen.add(segment.index);
    let url;
    try {
      url = new URL(segment.link);
    } catch {
      throw new Error(`audioMerge.segments[${position}].link must be a valid URL`);
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error(`audioMerge.segments[${position}].link must use http or https`);
    }
  }

  assertObject(job.input, 'input');
  if (job.input.template !== 'handdrawn_reading_coloring_video') {
    throw new Error('input.template must be handdrawn_reading_coloring_video');
  }
  if (!Array.isArray(job.input.scenes) || job.input.scenes.length < 1) {
    throw new Error('input.scenes must be a non-empty array');
  }
  if (!job.input.video || typeof job.input.video.width !== 'number' || typeof job.input.video.height !== 'number' || typeof job.input.video.fps !== 'number') {
    throw new Error('input.video must include numeric width, height, and fps');
  }

  checkUnsafeStrings(job);

  return {
    sceneCount: job.input.scenes.length,
    segmentCount: job.audioMerge.segments.length,
  };
};

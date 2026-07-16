import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {Scene, VideoConfig} from './videoData';

type Props = {
  scenes: Scene[];
  videoConfig: VideoConfig;
};

const palette = {
  paper: '#BFE5D5',
  paper2: '#D9EEE5',
  ink: '#111318',
  muted: '#40524B',
  white: '#F8F7F1',
  blue: '#3333A4',
  green: '#078B53',
  red: '#B64038',
};

const accentColor = (accent: Scene['accent']) => {
  if (accent === 'green') return palette.green;
  if (accent === 'red') return palette.red;
  if (accent === 'ink') return palette.ink;
  return palette.blue;
};

const fade = (frame: number, start: number, duration: number) =>
  interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

const draw = (frame: number, start: number, duration: number) =>
  interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

const seeded = (seed: string) => {
  let value = 0;
  for (let i = 0; i < seed.length; i += 1) {
    value = (value * 31 + seed.charCodeAt(i)) % 9973;
  }
  return value / 9973;
};

const wiggle = (seed: string, frame: number, amount: number) => {
  const base = seeded(seed) * Math.PI * 2;
  return {
    x: Math.sin(frame / 19 + base) * amount,
    y: Math.cos(frame / 23 + base) * amount,
    rotate: Math.sin(frame / 31 + base) * amount * 0.2,
  };
};

const baseText: React.CSSProperties = {
  fontFamily:
    '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "SimHei", sans-serif',
  letterSpacing: 0,
};

const InkSvg: React.FC<{scene: Scene; frame: number}> = ({scene, frame}) => {
  const color = accentColor(scene.accent);
  const progress = draw(frame, 8, 42);
  const dash = {
    strokeDasharray: 1,
    strokeDashoffset: 1 - progress,
  };
  const float = wiggle(`${scene.id}-svg`, frame, 2.2);

  if (scene.kind === 'icons') {
    return (
      <svg viewBox="0 0 560 330" style={{width: '100%', height: '100%', overflow: 'visible'}}>
        {[0, 1, 2].map((item) => (
          <g key={item} transform={`translate(${70 + item * 155} 52) rotate(${item === 1 ? -3 : 3})`}>
            <rect x="0" y="0" width="118" height="156" rx="8" fill={palette.white} stroke={palette.ink} strokeWidth="5" />
            <path d="M25 108 C42 80, 74 82, 93 109" fill="none" stroke={palette.ink} strokeWidth="4" style={dash} pathLength={1} />
            <circle cx="58" cy="58" r="25" fill="none" stroke={palette.ink} strokeWidth="4" style={dash} pathLength={1} />
            <path d="M36 58 C48 48, 68 48, 80 59" fill="none" stroke={color} strokeWidth="4" style={dash} pathLength={1} />
          </g>
        ))}
        <path d="M50 265 C170 234, 292 298, 507 244" fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" style={dash} pathLength={1} />
      </svg>
    );
  }

  if (scene.kind === 'feeling') {
    return (
      <svg viewBox="0 0 560 330" style={{width: '100%', height: '100%', overflow: 'visible'}}>
        <path d="M83 188 C123 64, 236 73, 276 185 C318 71, 437 71, 477 187" fill="none" stroke={palette.ink} strokeWidth="7" strokeLinecap="round" style={dash} pathLength={1} />
        <path d="M75 214 C164 276, 397 276, 486 212" fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" style={dash} pathLength={1} />
        <path d="M151 142 L170 116 L186 145 L207 111 L228 146" fill="none" stroke={palette.ink} strokeWidth="5" strokeLinecap="round" style={dash} pathLength={1} />
        <path d="M348 137 C370 104, 419 104, 438 139" fill="none" stroke={palette.ink} strokeWidth="5" strokeLinecap="round" style={dash} pathLength={1} />
      </svg>
    );
  }

  if (scene.kind === 'gesture') {
    return (
      <svg viewBox="0 0 560 330" style={{width: '100%', height: '100%', overflow: 'visible'}}>
        <rect x="86" y="42" width="388" height="232" rx="16" fill={palette.white} stroke={palette.ink} strokeWidth="6" />
        <path d="M142 230 C206 128, 338 131, 415 226" fill="none" stroke={palette.ink} strokeWidth="6" strokeLinecap="round" style={dash} pathLength={1} />
        <path d="M180 122 C215 75, 346 75, 385 123" fill="none" stroke={palette.ink} strokeWidth="5" strokeLinecap="round" style={dash} pathLength={1} />
        <path d="M148 280 C250 244, 338 315, 464 260" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" style={dash} pathLength={1} />
        <circle cx="280" cy="157" r="38" fill="none" stroke={color} strokeWidth="5" style={dash} pathLength={1} />
      </svg>
    );
  }

  if (scene.kind === 'courtyard') {
    return (
      <svg viewBox="0 0 560 330" style={{width: '100%', height: '100%', overflow: 'visible'}}>
        <path d="M82 266 L478 266 L429 106 L132 106 Z" fill={palette.white} stroke={palette.ink} strokeWidth="5" />
        <path d="M142 106 L142 47 M418 106 L418 47 M142 47 L418 47" fill="none" stroke={palette.ink} strokeWidth="6" strokeLinecap="round" style={dash} pathLength={1} />
        <path d="M188 229 C245 179, 320 179, 378 230" fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" style={dash} pathLength={1} />
        <path d="M208 124 L352 252" fill="none" stroke={palette.ink} strokeWidth="4" strokeLinecap="round" strokeDasharray="10 13" />
        <path d="M226 252 C254 210, 306 210, 335 252" fill="none" stroke={palette.ink} strokeWidth="5" strokeLinecap="round" style={dash} pathLength={1} />
      </svg>
    );
  }

  if (scene.kind === 'summary') {
    return (
      <svg viewBox="0 0 560 330" style={{width: '100%', height: '100%', overflow: 'visible'}}>
        <path d="M95 72 L465 72 L465 258 L95 258 Z" fill={palette.white} stroke={palette.ink} strokeWidth="5" />
        <path d="M135 121 H425 M135 164 H425 M135 207 H380" fill="none" stroke={palette.ink} strokeWidth="5" strokeLinecap="round" style={dash} pathLength={1} />
        <path d="M112 286 C212 246, 346 312, 468 260" fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" style={dash} pathLength={1} />
        <path d="M98 73 C184 28, 366 29, 466 72" fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" style={dash} pathLength={1} />
      </svg>
    );
  }

  if (scene.kind === 'ending') {
    return (
      <svg viewBox="0 0 560 330" style={{width: '100%', height: '100%', overflow: 'visible'}}>
        <path d="M145 49 H415 V279 H145 Z" fill={palette.white} stroke={palette.ink} strokeWidth="6" />
        <path d="M183 110 C228 79, 335 80, 381 111" fill="none" stroke={palette.ink} strokeWidth="6" strokeLinecap="round" style={dash} pathLength={1} />
        <path d="M202 178 C252 214, 309 214, 360 178" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" style={dash} pathLength={1} />
        <path d="M120 302 C235 260, 330 332, 466 286" fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" style={dash} pathLength={1} />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 560 330" style={{width: '100%', height: '100%', overflow: 'visible'}}>
      <path d="M105 279 V132 C105 62, 455 62, 455 132 V279" fill={palette.white} stroke={palette.ink} strokeWidth="6" />
      <path d="M161 279 V154 C161 93, 399 93, 399 154 V279" fill="none" stroke={palette.ink} strokeWidth="5" style={dash} pathLength={1} />
      <path d="M140 284 C250 245, 342 319, 468 262" fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" style={dash} pathLength={1} />
      <path d="M224 176 C244 153, 314 153, 336 177" fill="none" stroke={palette.ink} strokeWidth="5" strokeLinecap="round" style={dash} pathLength={1} />
      <circle cx="280" cy="197" r="38" fill="none" stroke={color} strokeWidth="5" style={dash} pathLength={1} />
      <g style={{transform: `translate(${float.x}px, ${float.y}px) rotate(${float.rotate}deg)`}}>
        <text x="280" y="75" textAnchor="middle" fontSize="58" fill={palette.ink} style={baseText}>?</text>
      </g>
    </svg>
  );
};

const Blob: React.FC<{
  scene: Scene;
  children: React.ReactNode;
  top: number;
  delay: number;
}> = ({scene, children, top, delay}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const pop = spring({frame: Math.max(0, frame - delay), fps, config: {damping: 14, stiffness: 130}});
  const color = accentColor(scene.accent);
  return (
    <div
      style={{
        ...baseText,
        position: 'absolute',
        left: 50,
        top,
        width: 620,
        minHeight: 170,
        padding: '34px 42px',
        color: palette.white,
        background: color,
        borderRadius: '42% 58% 44% 56% / 36% 40% 60% 64%',
        transform: `scale(${0.88 + pop * 0.12}) translateY(${(1 - pop) * 24}px)`,
        opacity: fade(frame, delay, 12),
        boxShadow: '0 10px 0 rgba(17,19,24,0.09)',
      }}
    >
      {children}
    </div>
  );
};

const SceneCard: React.FC<{scene: Scene; index: number}> = ({scene, index}) => {
  const frame = useCurrentFrame();
  const artOpacity = fade(frame, 0, 18);
  const titleOpacity = fade(frame, 12, 16);
  const bodyOpacity = fade(frame, 32, 16);
  const noteOpacity = fade(frame, 58, 16);
  const color = accentColor(scene.accent);
  const float = wiggle(scene.id, frame, 1.7);
  const titleLines = scene.title.split('\n');
  const titleFontSize = (line: string) =>
    line.length >= 11 ? 42 : line.length >= 9 ? 46 : 52;

  return (
    <AbsoluteFill
      style={{
        ...baseText,
        background:
          index % 2 === 0
            ? `linear-gradient(180deg, ${palette.paper} 0%, ${palette.paper2} 100%)`
            : `linear-gradient(180deg, ${palette.paper2} 0%, ${palette.paper} 100%)`,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.12,
          backgroundImage:
            'radial-gradient(#111318 1px, transparent 1px), radial-gradient(#111318 1px, transparent 1px)',
          backgroundPosition: '0 0, 13px 17px',
          backgroundSize: '28px 28px',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 50,
          top: 42,
          width: 620,
          height: 72,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          opacity: fade(frame, 4, 12),
        }}
      >
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: '50%',
            border: `5px solid ${palette.ink}`,
            background: color,
          }}
        />
        <div
          style={{
            color: palette.ink,
            fontWeight: 800,
            fontSize: 26,
            lineHeight: 1.2,
          }}
        >
          {scene.eyebrow}
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 74,
          top: 134,
          width: 572,
          height: 300,
          opacity: artOpacity,
          transform: `translate(${float.x}px, ${float.y}px) rotate(${float.rotate}deg)`,
        }}
      >
        <InkSvg scene={scene} frame={frame} />
      </div>
      <Blob scene={scene} top={420} delay={18}>
        {titleLines.map((line, lineIndex) => (
          <div
            key={line}
            style={{
              fontSize: titleFontSize(line),
              lineHeight: 1.14,
              fontWeight: 900,
              opacity: titleOpacity,
              textShadow: '0 2px 0 rgba(0,0,0,0.08)',
            }}
          >
            {line}
          </div>
        ))}
      </Blob>
      <div
        style={{
          position: 'absolute',
          left: 64,
          top: 606,
          width: 592,
          padding: '28px 30px',
          color: palette.ink,
          background: 'rgba(248, 247, 241, 0.84)',
          border: `4px solid ${palette.ink}`,
          borderRadius: 28,
          fontSize: scene.body.length > 42 ? 32 : 38,
          lineHeight: 1.36,
          fontWeight: 700,
          opacity: bodyOpacity,
          transform: `translateY(${(1 - bodyOpacity) * 22}px)`,
        }}
      >
        {scene.body}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 64,
          bottom: 44,
          width: 592,
          color: scene.accent === 'ink' ? palette.ink : color,
          fontSize: scene.note.length > 34 ? 24 : 30,
          lineHeight: 1.35,
          fontWeight: 800,
          opacity: noteOpacity,
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: 64,
            height: 8,
            marginRight: 14,
            marginBottom: 7,
            borderRadius: 999,
            background: color,
          }}
        />
        {scene.note}
      </div>
    </AbsoluteFill>
  );
};

export const SummerExcerptVideo: React.FC<Props> = ({scenes, videoConfig}) => {
  let cursor = 0;
  return (
    <AbsoluteFill>
      {scenes.map((scene, index) => {
        const from = cursor;
        const durationInFrames = scene.duration * videoConfig.fps;
        cursor += durationInFrames;
        return (
          <Sequence key={scene.id} from={from} durationInFrames={durationInFrames}>
            <SceneCard scene={scene} index={index} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

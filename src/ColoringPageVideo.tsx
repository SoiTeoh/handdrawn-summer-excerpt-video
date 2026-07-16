import React from 'react';
import {
  AbsoluteFill,
  Audio,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {Narration, Scene, VideoConfig} from './videoData';

type Props = {
  scenes: Scene[];
  narration?: Narration;
  videoConfig: VideoConfig;
};

const crayon = {
  paper: '#F9F4E7',
  paperShadow: '#E4DCCB',
  ink: '#191715',
  pencil: '#58524A',
  blue: '#506BC8',
  red: '#D65A4B',
  yellow: '#F2C957',
  green: '#61A66B',
  peach: '#EBAE7C',
  lilac: '#A891D2',
};

const baseText: React.CSSProperties = {
  fontFamily:
    '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "SimHei", sans-serif',
  letterSpacing: 0,
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

const seedNumber = (seed: string) => {
  let value = 7;
  for (let i = 0; i < seed.length; i += 1) {
    value = (value * 37 + seed.charCodeAt(i)) % 7919;
  }
  return value / 7919;
};

const wobble = (seed: string, frame: number, amount: number) => {
  const base = seedNumber(seed) * Math.PI * 2;
  return {
    x: Math.sin(frame / 17 + base) * amount,
    y: Math.cos(frame / 21 + base) * amount,
    r: Math.sin(frame / 29 + base) * amount * 0.25,
  };
};

const accentFor = (accent: Scene['accent']) => {
  if (accent === 'green') return crayon.green;
  if (accent === 'red') return crayon.red;
  if (accent === 'ink') return crayon.pencil;
  return crayon.blue;
};

const resolveAudioSrc = (src?: string) => {
  if (!src) return undefined;
  if (/^https?:\/\//i.test(src) || src.startsWith('data:') || src.startsWith('/')) {
    return src;
  }
  return staticFile(src);
};

const crayonFill = (id: string, color: string, opacity = 0.75) => (
  <pattern id={id} width="17" height="13" patternUnits="userSpaceOnUse" patternTransform="rotate(-8)">
    <rect width="17" height="13" fill={color} opacity={opacity * 0.72} />
    <path d="M-2 3 H19 M-3 10 H18" stroke="#fff7e8" strokeWidth="3" opacity="0.28" />
    <path d="M2 6 H16" stroke={color} strokeWidth="5" opacity="0.32" />
  </pattern>
);

const strokeStyle = (progress: number): React.CSSProperties => ({
  strokeDasharray: 1,
  strokeDashoffset: 1 - progress,
});

const FaceFrames: React.FC<{progress: number; shadeId: string; strokeColor: string}> = ({
  progress,
  shadeId,
  strokeColor,
}) => (
  <>
    <path d="M86 93 C141 55, 219 61, 260 102 C316 52, 418 61, 474 112" fill="none" stroke={crayon.ink} strokeWidth="8" strokeLinecap="round" style={strokeStyle(progress)} pathLength={1} />
    <path d="M96 148 C171 234, 385 237, 464 151" fill="none" stroke={`url(#${shadeId})`} strokeWidth="44" strokeLinecap="round" opacity="0.74" />
    <path d="M96 148 C171 234, 385 237, 464 151" fill="none" stroke={strokeColor} strokeWidth="7" strokeLinecap="round" style={strokeStyle(progress)} pathLength={1} />
    <circle cx="188" cy="143" r="22" fill="none" stroke={crayon.ink} strokeWidth="6" style={strokeStyle(progress)} pathLength={1} />
    <circle cx="366" cy="143" r="22" fill="none" stroke={crayon.ink} strokeWidth="6" style={strokeStyle(progress)} pathLength={1} />
  </>
);

const MiniLabel: React.FC<{x: number; y: number; text: string; color: string}> = ({
  x,
  y,
  text,
  color,
}) => (
  <g transform={`translate(${x} ${y})`}>
    <rect x="-8" y="-24" width={text.length * 24 + 18} height="36" rx="10" fill="#fff8e8" stroke={crayon.ink} strokeWidth="3" />
    <text x="0" y="2" fontSize="22" fill={color} fontWeight="900" style={baseText}>
      {text}
    </text>
  </g>
);

const DrawPerson: React.FC<{x: number; y: number; scale?: number; ghost?: boolean}> = ({
  x,
  y,
  scale = 1,
  ghost = false,
}) => (
  <g transform={`translate(${x} ${y}) scale(${scale})`} opacity={ghost ? 0.38 : 1}>
    <circle cx="0" cy="0" r="16" fill="#fff8e8" stroke={crayon.ink} strokeWidth="5" />
    <path d="M0 18 V68 M-27 42 H27 M-20 104 L0 68 L22 104" fill="none" stroke={crayon.ink} strokeWidth="6" strokeLinecap="round" />
  </g>
);

const ColoringDoodle: React.FC<{scene: Scene; frame: number}> = ({scene, frame}) => {
  const color = accentFor(scene.accent);
  const progress = draw(frame, 8, 46);
  const fillId = `fill-${scene.id}`;
  const shadeId = `shade-${scene.id}`;
  const shakey = wobble(`doodle-${scene.id}`, frame, 1.6);

  const common = {
    fill: 'none',
    stroke: crayon.ink,
    strokeWidth: 7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    style: strokeStyle(progress),
    pathLength: 1,
  };

  return (
    <svg viewBox="0 0 560 360" style={{width: '100%', height: '100%', overflow: 'visible'}}>
      <defs>
        {crayonFill(fillId, color, 0.82)}
        {crayonFill(shadeId, color, 0.54)}
        <filter id={`rough-${scene.id}`} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="2" seed={Math.round(seedNumber(scene.id) * 1000)} />
          <feDisplacementMap in="SourceGraphic" scale="1.5" />
        </filter>
      </defs>
      <g transform={`translate(${shakey.x} ${shakey.y}) rotate(${shakey.r} 280 180)`} filter={`url(#rough-${scene.id})`}>
        {scene.visualMetaphor === 'street_frame_people' ? (
          <>
            <path d="M58 294 C128 250, 218 232, 292 240 C374 248, 430 226, 510 184" fill="none" stroke={crayon.pencil} strokeWidth="7" strokeLinecap="round" strokeDasharray="12 13" opacity="0.52" />
            <DrawPerson x={96} y={167} scale={0.75} ghost />
            <DrawPerson x={452} y={142} scale={0.7} ghost />
            <rect x="182" y="65" width="208" height="190" rx="15" fill={`url(#${fillId})`} opacity="0.55" />
            <rect x="182" y="65" width="208" height="190" rx="15" {...common} />
            <path d="M224 143 C246 116, 322 116, 346 145" {...common} />
            <circle cx="286" cy="172" r="42" fill="none" stroke={color} strokeWidth="9" style={strokeStyle(progress)} pathLength={1} />
            <path d="M100 296 C212 258, 346 326, 496 276" fill="none" stroke={color} strokeWidth="13" strokeLinecap="round" opacity="0.75" style={strokeStyle(progress)} pathLength={1} />
            <MiniLabel x={170} y={321} text="被画框挡住" color={color} />
          </>
        ) : scene.visualMetaphor === 'museum_faces' ? (
          <>
            {[0, 1, 2].map((item) => (
              <g key={item} transform={`translate(${78 + item * 150} 54) rotate(${item === 1 ? -5 : 4})`}>
                <rect x="0" y="0" width="118" height="158" rx="9" fill={`url(#${fillId})`} opacity="0.7" />
                <rect x="0" y="0" width="118" height="158" rx="9" {...common} />
                <circle cx="58" cy="58" r="27" {...common} />
                <path d="M28 114 C47 83, 76 82, 94 113" {...common} />
              </g>
            ))}
            <path d="M56 284 C172 246, 288 313, 505 258" fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" opacity="0.72" style={strokeStyle(progress)} pathLength={1} />
            <DrawPerson x={280} y={260} scale={0.42} ghost />
            <MiniLabel x={203} y={330} text="真实的人退后" color={color} />
          </>
        ) : scene.visualMetaphor === 'emotion_icons' ? (
          <>
            {[
              ['恨', 112, 132, crayon.red],
              ['爱', 224, 102, crayon.peach],
              ['泪', 338, 132, crayon.blue],
              ['乐', 448, 102, crayon.yellow],
            ].map(([label, x, y, fill]) => (
              <g key={String(label)} transform={`translate(${x} ${y})`}>
                <circle cx="0" cy="0" r="48" fill={String(fill)} opacity="0.45" />
                <circle cx="0" cy="0" r="48" {...common} />
                <text x="0" y="12" textAnchor="middle" fontSize="34" fill={crayon.ink} fontWeight="900" style={baseText}>
                  {label}
                </text>
              </g>
            ))}
            <path d="M84 246 C156 282, 243 280, 280 230 C324 283, 420 283, 488 246" fill="none" stroke={color} strokeWidth="13" strokeLinecap="round" opacity="0.75" style={strokeStyle(progress)} pathLength={1} />
            <MiniLabel x={178} y={322} text="情感长成命运" color={color} />
          </>
        ) : scene.visualMetaphor === 'body_gesture' ? (
          <>
            <rect x="84" y="44" width="392" height="244" rx="12" fill={`url(#${fillId})`} opacity="0.5" />
            <rect x="84" y="44" width="392" height="244" rx="12" {...common} />
            <path d="M143 235 C196 149, 260 128, 416 238" {...common} />
            <path d="M174 130 C225 83, 345 80, 386 128" {...common} />
            <path d="M232 185 C262 160, 302 162, 330 188" fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" style={strokeStyle(progress)} pathLength={1} />
            <path d="M415 238 L470 216" fill="none" stroke={crayon.ink} strokeWidth="7" strokeLinecap="round" />
            <path d="M124 308 C232 264, 355 326, 480 275" fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" opacity="0.7" style={strokeStyle(progress)} pathLength={1} />
            <MiniLabel x={188} y={322} text="真实在姿态里" color={color} />
          </>
        ) : scene.visualMetaphor === 'empty_courtyard' ? (
          <>
            <path d="M80 278 L480 278 L430 108 L132 108 Z" fill={`url(#${fillId})`} opacity="0.48" />
            <path d="M80 278 L480 278 L430 108 L132 108 Z" {...common} />
            <path d="M143 108 V48 M420 108 V48 M143 48 H420" {...common} />
            <path d="M205 130 L355 258" fill="none" stroke={crayon.pencil} strokeWidth="5" strokeLinecap="round" strokeDasharray="10 15" opacity="0.8" />
            <path d="M184 238 C243 190, 321 188, 380 240" fill="none" stroke={color} strokeWidth="15" strokeLinecap="round" opacity="0.72" style={strokeStyle(progress)} pathLength={1} />
            <path d="M280 280 V320" fill="none" stroke={crayon.ink} strokeWidth="6" strokeLinecap="round" />
            <MiniLabel x={170} y={330} text="没有出口的当下" color={color} />
          </>
        ) : scene.visualMetaphor === 'meaning_vs_real' ? (
          <>
            <DrawPerson x={150} y={135} scale={0.9} />
            <rect x="250" y="58" width="226" height="154" rx="16" fill={`url(#${fillId})`} opacity="0.48" />
            <rect x="250" y="58" width="226" height="154" rx="16" {...common} />
            <text x="363" y="126" textAnchor="middle" fontSize="34" fill={color} fontWeight="900" style={baseText}>意义?</text>
            <path d="M208 138 C238 116, 239 116, 258 116" fill="none" stroke={crayon.ink} strokeWidth="6" strokeLinecap="round" />
            <path d="M96 292 C210 250, 335 323, 482 276" fill="none" stroke={color} strokeWidth="13" strokeLinecap="round" opacity="0.72" style={strokeStyle(progress)} pathLength={1} />
            <MiniLabel x={190} y={330} text="别急着找答案" color={color} />
          </>
        ) : scene.visualMetaphor === 'real_face' ? (
          <>
            <path d="M146 52 H416 V286 H146 Z" fill={`url(#${fillId})`} opacity="0.5" />
            <path d="M146 52 H416 V286 H146 Z" {...common} />
            <FaceFrames progress={progress} shadeId={shadeId} strokeColor={color} />
            <MiniLabel x={218} y={328} text="只交还此刻" color={color} />
          </>
        ) : (
          <>
            <path d="M102 286 V132 C102 64, 458 64, 458 132 V286" fill={`url(#${fillId})`} opacity="0.5" />
            <path d="M102 286 V132 C102 64, 458 64, 458 132 V286" {...common} />
            <path d="M162 286 V157 C162 99, 398 99, 398 157 V286" {...common} />
            <circle cx="280" cy="206" r="42" fill="none" stroke={color} strokeWidth="9" style={strokeStyle(progress)} pathLength={1} />
            <path d="M140 309 C248 264, 352 329, 470 276" fill="none" stroke={color} strokeWidth="13" strokeLinecap="round" opacity="0.75" style={strokeStyle(progress)} pathLength={1} />
            <text x="280" y="80" textAnchor="middle" fontSize="58" fill={crayon.ink} style={baseText}>?</text>
          </>
        )}
      </g>
    </svg>
  );
};

const Tape: React.FC<{left: number; top: number; rotate: number; color?: string}> = ({
  left,
  top,
  rotate,
  color = '#E9D9A4',
}) => (
  <div
    style={{
      position: 'absolute',
      left,
      top,
      width: 116,
      height: 34,
      background: color,
      opacity: 0.75,
      transform: `rotate(${rotate}deg)`,
      border: '2px solid rgba(25,23,21,0.12)',
      boxShadow: '0 3px 0 rgba(0,0,0,0.06)',
    }}
  />
);

const ColoringScene: React.FC<{scene: Scene; index: number}> = ({scene, index}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const accent = accentFor(scene.accent);
  const sheetPop = spring({frame, fps, config: {damping: 18, stiffness: 90}});
  const artIn = fade(frame, 3, 18);
  const titleIn = fade(frame, 22, 14);
  const bodyIn = fade(frame, 40, 16);
  const noteIn = fade(frame, 64, 16);
  const drift = wobble(`sheet-${scene.id}`, frame, 1.2);
  const titleLines = scene.title.split('\n');
  const longestTitleLine = Math.max(...titleLines.map((line) => line.length));
  const titleSize = longestTitleLine >= 10 ? 39 : longestTitleLine >= 8 ? 44 : 52;

  return (
    <AbsoluteFill
      style={{
        ...baseText,
        background: '#D7E8DB',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'radial-gradient(rgba(25,23,21,0.10) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
          opacity: 0.55,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 42,
          top: 34,
          width: 636,
          height: 886,
          background: crayon.paper,
          boxShadow: '9px 12px 0 rgba(66,52,33,0.18)',
          border: '3px solid rgba(25,23,21,0.2)',
          transform: `scale(${0.94 + sheetPop * 0.06}) translate(${drift.x}px, ${drift.y}px) rotate(${index % 2 === 0 ? -0.5 + drift.r : 0.45 + drift.r}deg)`,
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.2,
            background:
              'linear-gradient(90deg, transparent 0, rgba(255,255,255,0.8) 48%, transparent 52%), radial-gradient(rgba(25,23,21,0.15) 1px, transparent 1px)',
            backgroundSize: '140px 100%, 18px 18px',
          }}
        />
        <Tape left={74} top={-16} rotate={-6} />
        <Tape left={452} top={-11} rotate={7} color="#D7D9B1" />
        <div
          style={{
            position: 'absolute',
            left: 44,
            top: 36,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            opacity: fade(frame, 5, 12),
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              background: accent,
              border: `5px solid ${crayon.ink}`,
              boxShadow: '3px 2px 0 rgba(0,0,0,0.12)',
            }}
          />
          <div
            style={{
              color: crayon.ink,
              fontSize: 24,
              fontWeight: 900,
              maxWidth: 510,
              lineHeight: 1.18,
            }}
          >
            {scene.eyebrow}
          </div>
        </div>
        <div
          style={{
            position: 'absolute',
            left: 38,
            top: 106,
            width: 560,
            height: 330,
            opacity: artIn,
            transform: `translateY(${(1 - artIn) * 14}px)`,
          }}
        >
          <ColoringDoodle scene={scene} frame={frame} />
        </div>
        <div
          style={{
            position: 'absolute',
            left: 50,
            top: 430,
            width: 536,
            padding: '24px 26px',
            background: 'rgba(255, 255, 255, 0.42)',
            border: `6px solid ${crayon.ink}`,
            borderRadius: '26px 18px 30px 22px',
            opacity: titleIn,
            transform: `rotate(${index % 2 === 0 ? -1 : 1.2}deg) translateY(${(1 - titleIn) * 18}px)`,
          }}
        >
          {titleLines.map((line) => (
            <div
              key={line}
              style={{
                color: accent,
                fontSize: titleSize,
                fontWeight: 900,
                lineHeight: 1.15,
                textShadow: '2px 2px 0 rgba(255,255,255,0.9), 4px 3px 0 rgba(25,23,21,0.08)',
              }}
            >
              {line}
            </div>
          ))}
        </div>
        <div
          style={{
            position: 'absolute',
            left: 58,
            top: 612,
            width: 520,
            minHeight: 134,
            color: crayon.ink,
            fontSize: scene.body.length > 48 ? 30 : 34,
            lineHeight: 1.38,
            fontWeight: 900,
            opacity: bodyIn,
            transform: `translateY(${(1 - bodyIn) * 18}px)`,
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 35,
              height: 104,
              background:
                'repeating-linear-gradient(transparent 0, transparent 39px, rgba(80,107,200,0.18) 41px, transparent 43px)',
            }}
          />
          <div style={{position: 'relative'}}>{scene.body}</div>
        </div>
        <div
          style={{
            position: 'absolute',
            left: 58,
            bottom: 38,
            width: 520,
            color: crayon.pencil,
            fontSize: scene.note.length > 38 ? 23 : 27,
            lineHeight: 1.34,
            fontWeight: 900,
            opacity: noteIn,
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: 58,
              height: 10,
              marginRight: 12,
              marginBottom: 6,
              background: accent,
              borderRadius: 20,
              opacity: 0.85,
            }}
          />
          {scene.note}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const ColoringPageVideo: React.FC<Props> = ({
  scenes,
  narration,
  videoConfig,
}) => {
  let cursor = 0;
  const audioSrc = resolveAudioSrc(narration?.audioSrc);
  const totalFrames = Math.round(videoConfig.duration * videoConfig.fps);
  return (
    <AbsoluteFill>
      {narration?.enabled && narration.mode === 'full_track' && audioSrc ? (
        <Audio src={audioSrc} volume={narration.volume ?? 1} />
      ) : null}
      {scenes.map((scene, index) => {
        const from = cursor;
        const durationInFrames =
          index === scenes.length - 1
            ? totalFrames - cursor
            : Math.round(scene.duration * videoConfig.fps);
        cursor += durationInFrames;
        return (
          <Sequence key={scene.id} from={from} durationInFrames={durationInFrames}>
            <ColoringScene scene={scene} index={index} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

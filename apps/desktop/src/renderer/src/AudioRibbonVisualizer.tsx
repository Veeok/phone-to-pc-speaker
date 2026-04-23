import { useEffect, useRef } from 'react';
import {
  createIdleAudioVisualizerSignal,
  type AudioVisualizerSignal,
  type ConnectionState,
  type PhoneToPcSpeakerApi
} from '@phone-to-pc-speaker/shared-types';

export type VisualizerProfileId = 'calm' | 'balanced' | 'dramatic' | 'shimmer';

export const VISUALIZER_PROFILES = [
  { id: 'calm', label: 'Calm', hint: 'Elegant / softer' },
  { id: 'balanced', label: 'Balanced', hint: 'Default blend' },
  { id: 'dramatic', label: 'Dramatic', hint: 'Bigger / reactive' },
  { id: 'shimmer', label: 'Shimmer', hint: 'Airy / bright' }
] as const satisfies ReadonlyArray<{ id: VisualizerProfileId; label: string; hint: string }>;

interface AudioRibbonVisualizerProps {
  api: PhoneToPcSpeakerApi | null;
  paused: boolean;
  connectionState: ConnectionState;
  profile: VisualizerProfileId;
  pixelRatio: number;
}

interface RenderState {
  low: number;
  mid: number;
  high: number;
  transient: number;
  energy: number;
  phase: number;
  drift: number;
  shimmerPhase: number;
}

interface RibbonConfig {
  phaseOffset: number;
  amplitude: number;
  spread: number;
  speed: number;
  verticalOffset: number;
  lineCount: number;
  opacity: number;
  lowWeight: number;
  midWeight: number;
  highWeight: number;
  transientWeight: number;
  colors: readonly [string, string, string];
}

interface VisualizerProfileSettings {
  idleEnergy: number;
  attackScale: number;
  releaseScale: number;
  amplitudeGain: number;
  spreadGain: number;
  glowGain: number;
  phaseGain: number;
  driftGain: number;
  lineDensity: number;
  lowGain: number;
  midGain: number;
  highGain: number;
  transientGain: number;
  coreGain: number;
  shimmerGain: number;
}

const TAU = Math.PI * 2;
const IDLE_SIGNAL = createIdleAudioVisualizerSignal();

const RIBBONS: readonly RibbonConfig[] = [
  {
    phaseOffset: 0,
    amplitude: 1.04,
    spread: 0.98,
    speed: 0.62,
    verticalOffset: -0.17,
    lineCount: 26,
    opacity: 0.92,
    lowWeight: 1.28,
    midWeight: 0.46,
    highWeight: 0.2,
    transientWeight: 0.14,
    colors: ['#1a7eff', '#63efff', '#a8fbff']
  },
  {
    phaseOffset: 1.18,
    amplitude: 1.1,
    spread: 1.08,
    speed: 0.88,
    verticalOffset: 0.14,
    lineCount: 30,
    opacity: 0.98,
    lowWeight: 0.78,
    midWeight: 1.14,
    highWeight: 0.46,
    transientWeight: 0.34,
    colors: ['#a12fff', '#ff6ad9', '#ffd0f3']
  },
  {
    phaseOffset: 2.46,
    amplitude: 0.72,
    spread: 0.66,
    speed: 1.08,
    verticalOffset: -0.02,
    lineCount: 20,
    opacity: 0.74,
    lowWeight: 0.34,
    midWeight: 0.62,
    highWeight: 1.28,
    transientWeight: 1.08,
    colors: ['#7fe6ff', '#ffffff', '#ff9be8']
  }
];

const PROFILE_SETTINGS: Record<VisualizerProfileId, VisualizerProfileSettings> = {
  calm: {
    idleEnergy: 0.011,
    attackScale: 0.8,
    releaseScale: 0.9,
    amplitudeGain: 0.74,
    spreadGain: 0.82,
    glowGain: 0.74,
    phaseGain: 0.86,
    driftGain: 0.86,
    lineDensity: 0.92,
    lowGain: 0.86,
    midGain: 0.9,
    highGain: 0.8,
    transientGain: 0.72,
    coreGain: 0.84,
    shimmerGain: 0.76
  },
  balanced: {
    idleEnergy: 0.014,
    attackScale: 1,
    releaseScale: 1,
    amplitudeGain: 1,
    spreadGain: 1,
    glowGain: 1,
    phaseGain: 1,
    driftGain: 1,
    lineDensity: 1,
    lowGain: 1,
    midGain: 1,
    highGain: 1,
    transientGain: 1,
    coreGain: 1,
    shimmerGain: 1
  },
  dramatic: {
    idleEnergy: 0.016,
    attackScale: 1.18,
    releaseScale: 1.04,
    amplitudeGain: 1.34,
    spreadGain: 1.2,
    glowGain: 1.28,
    phaseGain: 1.12,
    driftGain: 1.06,
    lineDensity: 1.12,
    lowGain: 1.18,
    midGain: 1.14,
    highGain: 1.08,
    transientGain: 1.36,
    coreGain: 1.16,
    shimmerGain: 1.18
  },
  shimmer: {
    idleEnergy: 0.013,
    attackScale: 1.06,
    releaseScale: 0.98,
    amplitudeGain: 0.92,
    spreadGain: 1.06,
    glowGain: 1.12,
    phaseGain: 1.06,
    driftGain: 0.94,
    lineDensity: 1.08,
    lowGain: 0.88,
    midGain: 1.02,
    highGain: 1.34,
    transientGain: 1.28,
    coreGain: 0.96,
    shimmerGain: 1.42
  }
};

function getCanvasPixelRatio(pixelRatio: number): number {
  return Math.min(Math.max(pixelRatio || 1, 1), 3);
}

export function AudioRibbonVisualizer({ api, paused, connectionState, profile, pixelRatio }: AudioRibbonVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const targetSignalRef = useRef<AudioVisualizerSignal>(IDLE_SIGNAL);
  const lastSignalAtRef = useRef<number>(0);
  const renderStateRef = useRef<RenderState>({
    low: 0,
    mid: 0,
    high: 0,
    transient: 0,
    energy: 0,
    phase: 0,
    drift: 0,
    shimmerPhase: 0
  });

  useEffect(() => {
    if (api === null) {
      targetSignalRef.current = createIdleAudioVisualizerSignal();
      return;
    }

    return api.onAudioVisualizerSignalUpdated((payload) => {
      targetSignalRef.current = payload;
      lastSignalAtRef.current = performance.now();
    });
  }, [api]);

  useEffect(() => {
    if (connectionState === 'Connected') {
      return;
    }

    targetSignalRef.current = createIdleAudioVisualizerSignal();
  }, [connectionState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }

    const context = canvas.getContext('2d');
    if (context === null) {
      return;
    }

    const settings = PROFILE_SETTINGS[profile];
    const canvasPixelRatio = getCanvasPixelRatio(pixelRatio);

    const syncCanvasSize = () => {
      const nextWidth = Math.max(1, Math.round(canvas.clientWidth * canvasPixelRatio));
      const nextHeight = Math.max(1, Math.round(canvas.clientHeight * canvasPixelRatio));

      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth;
        canvas.height = nextHeight;
      }
    };

    syncCanvasSize();

    const resizeObserver = new ResizeObserver(() => {
      syncCanvasSize();
    });

    resizeObserver.observe(canvas);

    let animationFrameId = 0;
    let previousFrameAt = performance.now();

    const drawNow = (now: number) => {
      syncCanvasSize();

      const deltaSeconds = Math.min((now - previousFrameAt) / 1000, 0.05);
      previousFrameAt = now;

      const signalIsFresh = now - lastSignalAtRef.current < 260;
      const targetSignal = signalIsFresh ? targetSignalRef.current : IDLE_SIGNAL;
      const renderState = renderStateRef.current;
      const connected = connectionState === 'Connected';
      const idleEnergy = connected ? settings.idleEnergy : settings.idleEnergy * 0.42;
      const lowTarget = connected ? targetSignal.low : 0;
      const midTarget = connected ? targetSignal.mid : 0;
      const highTarget = connected ? targetSignal.high : 0;
      const transientTarget = connected ? targetSignal.transient : 0;
      const energyTarget = connected ? Math.max(targetSignal.energy, idleEnergy) : idleEnergy;

      renderState.low += (lowTarget - renderState.low) * ((lowTarget >= renderState.low ? 0.18 : 0.075) * (lowTarget >= renderState.low ? settings.attackScale : settings.releaseScale));
      renderState.mid += (midTarget - renderState.mid) * ((midTarget >= renderState.mid ? 0.2 : 0.085) * (midTarget >= renderState.mid ? settings.attackScale : settings.releaseScale));
      renderState.high += (highTarget - renderState.high) * ((highTarget >= renderState.high ? 0.22 : 0.095) * (highTarget >= renderState.high ? settings.attackScale : settings.releaseScale));
      renderState.transient += (transientTarget - renderState.transient) * ((transientTarget >= renderState.transient ? 0.38 : 0.18) * (transientTarget >= renderState.transient ? settings.attackScale : settings.releaseScale));
      renderState.energy += (energyTarget - renderState.energy) * ((energyTarget >= renderState.energy ? 0.18 : 0.08) * (energyTarget >= renderState.energy ? settings.attackScale : settings.releaseScale));
      renderState.phase += deltaSeconds * settings.phaseGain * (0.08 + (renderState.energy * 0.3) + (renderState.mid * 0.24));
      renderState.drift += deltaSeconds * settings.driftGain * (0.03 + (renderState.low * 0.18));
      renderState.shimmerPhase += deltaSeconds * settings.phaseGain * (0.14 + (renderState.high * 1.1) + (renderState.transient * 0.88));

       drawVisualizer(context, canvas, renderState, connected, settings, canvasPixelRatio);
     };

    const renderFrame = (now: number) => {
      drawNow(now);
      if (!paused) {
        animationFrameId = window.requestAnimationFrame(renderFrame);
      }
    };

    drawNow(previousFrameAt);

    if (!paused) {
      animationFrameId = window.requestAnimationFrame(renderFrame);
    }

    return () => {
      resizeObserver.disconnect();
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [connectionState, paused, pixelRatio, profile]);

  return (
    <div className="hero-visualizer" aria-hidden="true">
      <canvas className="hero-visualizer__canvas" ref={canvasRef} />
    </div>
  );
}

function drawVisualizer(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  renderState: RenderState,
  connected: boolean,
  settings: VisualizerProfileSettings,
  pixelRatio: number
) {
  const dpr = getCanvasPixelRatio(pixelRatio);
  const width = canvas.width / dpr;
  const height = canvas.height / dpr;

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);

  drawAmbientGlow(context, width, height, renderState, connected, settings);

  context.globalCompositeOperation = 'lighter';
  for (const ribbon of RIBBONS) {
    drawRibbon(context, width, height, renderState, ribbon, settings);
  }
  context.globalCompositeOperation = 'source-over';
}

function drawAmbientGlow(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  renderState: RenderState,
  connected: boolean,
  settings: VisualizerProfileSettings
) {
  const glowEnergy = (renderState.energy + (renderState.transient * 0.55)) * settings.glowGain;

  const leftGlow = context.createRadialGradient(width * 0.22, height * 0.52, 0, width * 0.22, height * 0.52, width * 0.56);
  leftGlow.addColorStop(0, `rgba(28, 140, 255, ${connected ? 0.05 + (glowEnergy * 0.18) + (renderState.low * settings.lowGain * 0.14) : 0.03})`);
  leftGlow.addColorStop(0.58, `rgba(56, 226, 255, ${connected ? 0.04 + (renderState.low * settings.lowGain * 0.08) : 0.02})`);
  leftGlow.addColorStop(1, 'rgba(16, 30, 54, 0)');
  context.fillStyle = leftGlow;
  context.fillRect(0, 0, width, height);

  const rightGlow = context.createRadialGradient(width * 0.8, height * 0.56, 0, width * 0.8, height * 0.56, width * 0.58);
  rightGlow.addColorStop(0, `rgba(255, 84, 202, ${connected ? 0.05 + (glowEnergy * 0.16) + (renderState.high * settings.highGain * 0.12) : 0.03})`);
  rightGlow.addColorStop(0.62, `rgba(186, 55, 255, ${connected ? 0.03 + (renderState.mid * settings.midGain * 0.09) : 0.02})`);
  rightGlow.addColorStop(1, 'rgba(30, 12, 40, 0)');
  context.fillStyle = rightGlow;
  context.fillRect(0, 0, width, height);

  const centerSheen = context.createLinearGradient(0, 0, width, 0);
  centerSheen.addColorStop(0, 'rgba(255, 255, 255, 0)');
  centerSheen.addColorStop(0.5, `rgba(255, 255, 255, ${0.008 + (renderState.mid * settings.midGain * 0.05) + (renderState.transient * settings.transientGain * 0.03)})`);
  centerSheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.fillStyle = centerSheen;
  context.fillRect(0, 0, width, height);
}

function drawRibbon(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  renderState: RenderState,
  ribbon: RibbonConfig,
  settings: VisualizerProfileSettings
) {
  const bassLift = Math.sin((renderState.drift * (0.74 + (ribbon.speed * 0.16))) + ribbon.phaseOffset) * height * 0.06 * renderState.low * ribbon.lowWeight * settings.lowGain;
  const centerY = (height * 0.5) + (height * ribbon.verticalOffset) + bassLift;
  const amplitude = height * settings.amplitudeGain * (0.03 + (renderState.energy * 0.1) + (renderState.low * 0.13 * ribbon.lowWeight * settings.lowGain)) * ribbon.amplitude;
  const spread = height * settings.spreadGain * (0.008 + (renderState.mid * 0.022 * ribbon.midWeight * settings.midGain) + (renderState.high * 0.01 * ribbon.highWeight * settings.highGain) + (renderState.transient * 0.016 * ribbon.transientWeight * settings.transientGain)) * ribbon.spread;
  const glowStrength = (renderState.energy + (renderState.transient * 0.66)) * settings.glowGain;
  const effectiveLineCount = Math.max(12, Math.round(ribbon.lineCount * settings.lineDensity));
  const gradient = context.createLinearGradient(0, 0, width, 0);

  gradient.addColorStop(0, withAlpha(ribbon.colors[0], 0.12 + (glowStrength * 0.1)));
  gradient.addColorStop(0.48, withAlpha(ribbon.colors[1], 0.26 + (glowStrength * 0.2)));
  gradient.addColorStop(1, withAlpha(ribbon.colors[2], 0.14 + (glowStrength * 0.12)));

  context.save();
  context.strokeStyle = gradient;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.shadowColor = withAlpha(ribbon.colors[1], 0.2 + (glowStrength * 0.22));
  context.shadowBlur = 14 + (glowStrength * 30) + (renderState.high * settings.highGain * 12);
  context.lineWidth = settings.coreGain * (4 + (renderState.energy * 4.5) + (renderState.low * settings.lowGain * 2.4) + (renderState.transient * settings.transientGain * 1.8));
  context.beginPath();
  drawRibbonPath(context, width, renderState, ribbon, centerY, amplitude, spread * 0.06, 0, settings);
  context.stroke();
  context.restore();

  context.save();
  context.strokeStyle = withAlpha(ribbon.colors[2], 0.18 + (renderState.transient * settings.transientGain * 0.18) + (renderState.high * settings.highGain * 0.08));
  context.lineWidth = 0.9 + (settings.shimmerGain * (0.2 + (renderState.transient * 0.7)));
  context.beginPath();
  drawRibbonPath(context, width, renderState, ribbon, centerY, amplitude, spread * 0.015, 0, settings);
  context.stroke();
  context.restore();

  for (let lineIndex = 0; lineIndex < effectiveLineCount; lineIndex += 1) {
    const normalizedIndex = effectiveLineCount === 1 ? 0 : (lineIndex / (effectiveLineCount - 1)) - 0.5;
    const offsetFactor = normalizedIndex * 2;
    const falloff = 1 - Math.min(Math.abs(offsetFactor), 1);

    context.beginPath();
    context.strokeStyle = withAlpha(ribbon.colors[1], (0.018 + (falloff * 0.048) + (glowStrength * 0.038)) * ribbon.opacity);
    context.lineWidth = 0.55 + (falloff * 0.34);
    drawRibbonPath(context, width, renderState, ribbon, centerY, amplitude, spread, offsetFactor, settings);
    context.stroke();
  }
}

function drawRibbonPath(
  context: CanvasRenderingContext2D,
  width: number,
  renderState: RenderState,
  ribbon: RibbonConfig,
  centerY: number,
  amplitude: number,
  spread: number,
  offsetFactor: number,
  settings: VisualizerProfileSettings
) {
  const step = Math.max(4, Math.floor(width / 190));
  let previousX = 0;
  let previousY = computeRibbonY(0, width, renderState, ribbon, centerY, amplitude, spread, offsetFactor, settings);

  context.moveTo(previousX, previousY);

  for (let x = step; x <= width + step; x += step) {
    const nextY = computeRibbonY(x, width, renderState, ribbon, centerY, amplitude, spread, offsetFactor, settings);
    const midX = (previousX + x) * 0.5;
    const midY = (previousY + nextY) * 0.5;
    context.quadraticCurveTo(previousX, previousY, midX, midY);
    previousX = x;
    previousY = nextY;
  }

  context.lineTo(previousX, previousY);
}

function computeRibbonY(
  x: number,
  width: number,
  renderState: RenderState,
  ribbon: RibbonConfig,
  centerY: number,
  amplitude: number,
  spread: number,
  offsetFactor: number,
  settings: VisualizerProfileSettings
) {
  const normalizedX = x / width;
  const clampedX = clamp01(normalizedX);
  const edgeEnvelope = Math.pow(Math.sin(clampedX * Math.PI), 0.78);
  const lowInfluence = renderState.low * ribbon.lowWeight * settings.lowGain;
  const midInfluence = renderState.mid * ribbon.midWeight * settings.midGain;
  const highInfluence = renderState.high * ribbon.highWeight * settings.highGain;
  const transientInfluence = renderState.transient * ribbon.transientWeight * settings.transientGain;
  const slowSweep = Math.sin(((normalizedX * (0.54 + (lowInfluence * 0.08))) + (renderState.drift * 0.42)) * TAU + (ribbon.phaseOffset * 0.76));
  const primaryWave = Math.sin(((normalizedX * (0.92 + (lowInfluence * 0.44))) + (renderState.phase * ribbon.speed)) * TAU + ribbon.phaseOffset);
  const bodyWave = Math.sin(((normalizedX * (1.84 + (midInfluence * 1.1))) - (renderState.phase * ribbon.speed * 0.56)) * TAU + (ribbon.phaseOffset * 1.68));
  const detailWave = Math.sin(((normalizedX * (4.4 + (highInfluence * 1.9))) + (renderState.phase * (0.92 + (ribbon.speed * 0.26))) + (offsetFactor * 0.08)) * TAU + (ribbon.phaseOffset * 0.88));
  const shimmerWave = Math.cos(((normalizedX * (6.9 + (highInfluence * 2.2 * settings.shimmerGain) + (transientInfluence * 2.8))) + (renderState.shimmerPhase * (0.76 + (ribbon.speed * 0.32))) + (offsetFactor * 0.16)) * TAU + (ribbon.phaseOffset * 2.14));

  return centerY
    + (offsetFactor * spread * (0.52 + edgeEnvelope))
    + (slowSweep * amplitude * 0.05)
    + (primaryWave * amplitude * edgeEnvelope * (0.82 + (lowInfluence * 0.15)))
    + (bodyWave * amplitude * edgeEnvelope * (0.16 + (midInfluence * 0.16)))
    + (detailWave * amplitude * (0.018 + (highInfluence * 0.05)))
    + (shimmerWave * amplitude * (0.005 + (transientInfluence * 0.04) + (highInfluence * 0.01 * settings.shimmerGain)));
}

function clamp01(value: number) {
  return Math.max(0, Math.min(value, 1));
}

function withAlpha(hexColor: string, alpha: number): string {
  const normalized = hexColor.replace('#', '');
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${clamp01(alpha)})`;
}

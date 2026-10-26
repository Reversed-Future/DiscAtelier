// Adapted from the React Bits SquishSwitch source supplied by the user.

import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent, type MouseEvent } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useSpring, useTransform, useVelocity } from 'motion/react';
import './SquishSwitch.css';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const FLOW_SPRING = { stiffness: 320, damping: 40, mass: 0.6 };
const SWELL_SPRING = { stiffness: 520, damping: 34, mass: 0.6 };
const MAX_STRETCH = 0.4;
const STRETCH_SPEED = 600;
const TAP_SLOP = { fine: 4, coarse: 8 };

interface SquishSwitchProps {
  checked?: boolean; defaultChecked?: boolean; onChange?(checked: boolean): void;
  label?: string; disabled?: boolean; trackColor?: string; trackOnColor?: string;
  thumbColor?: string; thumbOnColor?: string; width?: number; height?: number;
  radius?: number; speed?: number; stretch?: number; hoverScale?: number;
  colorDuration?: number; ariaLabel?: string; className?: string; id?: string;
}
interface Grip { id: number; grab: number; moved: boolean; startX: number; onAtPress: boolean; slop: number }
export default function SquishSwitch({
  checked,
  defaultChecked = false,
  onChange,
  label = '',
  disabled = false,
  trackColor = '#27272a',
  trackOnColor = '#f5f5f5',
  thumbColor = '',
  thumbOnColor = '',
  width = 76,
  height = 38,
  radius = 19,
  speed = 50,
  stretch = 36,
  hoverScale = 1.035,
  colorDuration = 320,
  ariaLabel,
  className = '',
  id
}: SquishSwitchProps) {
  const reduce = useReducedMotion();
  const inset = Math.max(3, Math.round(height * 0.11));
  const thumb = height - inset * 2;
  const min = inset;
  const max = width - inset - thumb;
  const mid = (min + max) / 2;
  const trackRadius = Math.min(radius, height / 2);
  const thumbRadius = Math.max(0, trackRadius - inset);

  const isControlled = checked !== undefined;
  const [inner, setInner] = useState(defaultChecked);
  const on = isControlled ? checked : inner;
  const [dragging, setDragging] = useState(false);
  const trackRef = useRef<HTMLSpanElement>(null);
  const grip = useRef<Grip | null>(null);
  const onRef = useRef(on);
  onRef.current = on;
  const skipClick = useRef(false);
  const autoId = useId();
  const buttonId = id ?? autoId;

  const x = useMotionValue(on ? max : min);
  const flow = useSpring(useVelocity(x), FLOW_SPRING);
  const swell = useSpring(1, SWELL_SPRING);
  const gain = reduce ? 0 : clamp(stretch, 0, 100) / 100;
  const stretchOf = (v: number) => 1 + Math.min(MAX_STRETCH, Math.abs(v) / STRETCH_SPEED) * gain;
  const scaleX = useTransform<number, number>([flow, swell], ([v, h]) => stretchOf(v) * h);
  const scaleY = useTransform<number, number>([flow, swell], ([v, h]) => h / stretchOf(v));

  const transform = useTransform<number, string>([x, scaleX, scaleY], ([position, sx, sy]) => `translateX(${position}px) scale(${sx}, ${sy})`);
  useEffect(() => { if (reduce || disabled) swell.jump(1); }, [reduce, disabled, swell]);

  const commit = (next: boolean) => {
    if (next === onRef.current) return;
    onRef.current = next;
    if (!isControlled) setInner(next);
    onChange?.(next);
  };

  useEffect(() => {
    if (dragging) return undefined;
    const target = on ? max : min;
    if (reduce) {
      x.jump(target);
      return undefined;
    }
    const controls = animate(x, target, {
      type: 'spring',
      stiffness: 170 - (50 - clamp(speed, 0, 100)) * 1.1,
      damping: 21.5,
      mass: 0.9,
      restDelta: 0.001,
      restSpeed: 0.01
    });
    return () => controls.stop();
  }, [on, dragging, min, max, speed, reduce, x]);

  const localX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const scale = rect.width / (el.offsetWidth || rect.width) || 1;
    return (clientX - rect.left) / scale;
  };
  const down = (e: PointerEvent<HTMLButtonElement>) => {
    if (disabled || grip.current || e.button !== 0) return;
    skipClick.current = false;
    grip.current = {
      id: e.pointerId,
      grab: localX(e.clientX) - x.get(),
      moved: false,
      startX: e.clientX,
      onAtPress: onRef.current,
      slop: e.pointerType === 'touch' ? TAP_SLOP.coarse : TAP_SLOP.fine
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    setDragging(true);
  };
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const g = grip.current;
    if (disabled || !g || g.id !== e.pointerId) return;
    const lx = localX(e.clientX);
    if (!g.moved && Math.abs(e.clientX - g.startX) > g.slop) g.moved = true;
    if (!g.moved) return;
    const nx = clamp(lx - g.grab, min, max);
    x.set(nx);
    commit(nx > mid);
  };
  const up = (e: Pick<PointerEvent<HTMLButtonElement>, 'pointerId' | 'currentTarget'>, cancelled: boolean) => {
    const g = grip.current;
    if (!g || g.id !== e.pointerId) return;
    grip.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    if (cancelled) commit(g.onAtPress);
    else if (!g.moved) commit(!onRef.current);
    skipClick.current = true;
    setDragging(false);
  };
  const click = (e: MouseEvent<HTMLButtonElement>) => {
    if (e.detail > 0 && skipClick.current) {
      skipClick.current = false;
      return;
    }
    if (!disabled) commit(!onRef.current);
  };

  return (
    <span className={`squish-switch-root${className ? ` ${className}` : ''}`}>
      <button
        id={buttonId}
        type="button"
        role="switch"
        aria-checked={on}
        aria-disabled={disabled || undefined}
        disabled={disabled}
        aria-label={ariaLabel}
        className="squish-switch"
        data-on={on ? '' : undefined}
        data-held={dragging ? '' : undefined}
        style={{
          '--ss-w': `${width}px`,
          '--ss-h': `${height}px`,
          '--ss-inset': `${inset}px`,
          '--ss-thumb': `${thumb}px`,
          '--ss-r': `${trackRadius}px`,
          '--ss-thumb-r': `${thumbRadius}px`,
          '--ss-track': trackColor,
          '--ss-track-on': trackOnColor,
          '--ss-thumb-color': thumbColor || `color-mix(in srgb, ${trackOnColor} 19%, ${trackColor})`,
          '--ss-thumb-on': thumbOnColor || trackColor,
          '--ss-fade': `${colorDuration}ms`
        } as CSSProperties}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={e => up(e, false)}
        onPointerCancel={e => up(e, true)}
        onLostPointerCapture={e => up(e, true)}
        onPointerEnter={e => {
          if (e.pointerType === 'mouse' && !disabled && !reduce && matchMedia('(hover: hover) and (pointer: fine)').matches) swell.set(hoverScale);
        }}
        onPointerLeave={() => swell.set(1)}
        onKeyDown={e => {
          if (e.key === 'Escape' && grip.current) {
            e.preventDefault();
            e.stopPropagation();
            up({ pointerId: grip.current.id, currentTarget: e.currentTarget }, true);
          }
        }}
        onClick={click}
      >
        <span ref={trackRef} className="squish-switch__track">
          <motion.span className="squish-switch__thumb" aria-hidden="true" style={{ transform }} />
        </span>
      </button>
      {label ? (
        <label htmlFor={buttonId} className="squish-switch__label">
          {label}
        </label>
      ) : null}
    </span>
  );
}

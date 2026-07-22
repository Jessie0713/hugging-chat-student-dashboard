import { useEffect, useRef, useState } from 'react'
import { Box } from '@mui/material'
import { dinoShadow } from '../theme/tokens'

/** 落下 → 展翅 → 上揚 → 再落下 */
export const FLYER_FLAP_FRAMES = [
  '/dinosaurs/dino-flyer-flap-01.png',
  '/dinosaurs/dino-flyer-flap-02.png',
  '/dinosaurs/dino-flyer-flap-03.png',
  '/dinosaurs/dino-flyer-flap-04.png',
  '/dinosaurs/dino-flyer-flap-05.png',
  '/dinosaurs/dino-flyer-flap-06.png',
  '/dinosaurs/dino-flyer-flap-07.png',
  '/dinosaurs/dino-flyer-flap-08.png',
]

const N_FRAMES = FLYER_FLAP_FRAMES.length
const FLIGHT_MS = 17000
const PAUSE_MS = 20000
/** 拍翅換幀間隔（無淡入淡出，直接切幀） */
const FLAP_FRAME_MS = 95

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
}

function clamp01(t) {
  return Math.min(1, Math.max(0, t))
}

const SPAWNS = [
  { id: 'rightHigh', y0: 0.08, y1: 0.22, kind: 'soar' },
  { id: 'rightMid', y0: 0.28, y1: 0.42, kind: 'weave' },
  { id: 'rightLow', y0: 0.48, y1: 0.62, kind: 'glide' },
  { id: 'topRight', y0: -0.05, y1: 0.35, kind: 'arc' },
  { id: 'bottomRight', y0: 0.75, y1: 0.4, kind: 'soar' },
  { id: 'rightDive', y0: 0.18, y1: 0.55, kind: 'glide' },
  { id: 'rightClimb', y0: 0.58, y1: 0.2, kind: 'arc' },
]

function samplePath(progress, spawn, size, w, h) {
  const p = easeInOut(clamp01(progress))
  const p2 = easeInOut(clamp01(progress + 0.005))

  const xAt = (pp) => w - (w + size) * pp

  const yAt = (pp) => {
    const yBase = h * (spawn.y0 + (spawn.y1 - spawn.y0) * pp)
    if (spawn.kind === 'soar') {
      return (
        yBase +
        Math.sin(pp * Math.PI) * -h * 0.1 +
        Math.sin(pp * Math.PI * 2) * h * 0.025
      )
    }
    if (spawn.kind === 'weave') {
      return yBase + Math.sin(pp * Math.PI * 3) * h * 0.07
    }
    if (spawn.kind === 'glide') {
      return yBase + Math.sin(pp * Math.PI) * h * 0.04
    }
    return yBase + Math.sin(pp * Math.PI) * -h * 0.12
  }

  const x = xAt(p)
  const y = yAt(p)
  const dx = xAt(p2) - x
  const dy = yAt(p2) - y
  const pitch = (Math.atan2(dy, Math.abs(dx) + 0.001) * 180) / Math.PI

  return { x, y, rot: pitch, size }
}

export default function AmbientFlyer() {
  const [enabled, setEnabled] = useState(true)
  const [pose, setPose] = useState(null)
  const rafRef = useRef(0)
  const flightRef = useRef(null)
  const flapRef = useRef({ frame: 0, lastTs: 0 })

  useEffect(() => {
    FLYER_FLAP_FRAMES.forEach((src) => {
      const img = new Image()
      img.src = src
    })
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setEnabled(!mq.matches)
    sync()
    mq.addEventListener?.('change', sync)
    return () => mq.removeEventListener?.('change', sync)
  }, [])

  useEffect(() => {
    if (!enabled) {
      setPose(null)
      return undefined
    }

    let cancelled = false
    let pauseTimer = 0

    const startFlight = () => {
      if (cancelled) return
      const spawn = SPAWNS[Math.floor(Math.random() * SPAWNS.length)]
      const duration = FLIGHT_MS + Math.floor(Math.random() * 3500) - 1200
      const w = window.innerWidth
      const size = w < 600 ? 150 : 220
      flapRef.current = { frame: 0, lastTs: performance.now() }
      flightRef.current = {
        spawn,
        duration,
        size,
        startedAt: performance.now(),
      }

      const tick = (now) => {
        if (cancelled || !flightRef.current) return
        const { spawn: sp, duration: d, size: sz, startedAt: t0 } =
          flightRef.current
        const progress = (now - t0) / d

        const flap = flapRef.current
        if (now - flap.lastTs >= FLAP_FRAME_MS) {
          const steps = Math.floor((now - flap.lastTs) / FLAP_FRAME_MS)
          flap.frame = (flap.frame + steps) % N_FRAMES
          flap.lastTs += steps * FLAP_FRAME_MS
        }

        if (progress >= 1) {
          setPose(null)
          pauseTimer = window.setTimeout(startFlight, PAUSE_MS)
          return
        }

        const pos = samplePath(
          progress,
          sp,
          sz,
          window.innerWidth,
          window.innerHeight,
        )
        setPose({ ...pos, frame: flap.frame })
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    startFlight()

    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      window.clearTimeout(pauseTimer)
    }
  }, [enabled])

  if (!enabled || !pose) return null

  return (
    <Box
      aria-hidden
      sx={{
        position: 'fixed',
        inset: 0,
        m: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        // 在儀表板後方，不遮住卡片／文字
        zIndex: 0,
      }}
    >
      <Box
        component='img'
        src={FLYER_FLAP_FRAMES[pose.frame]}
        alt=''
        sx={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: pose.size,
          height: 'auto',
          m: 0,
          display: 'block',
          opacity: 0.92,
          transform: `translate3d(${pose.x}px, ${pose.y}px, 0) rotate(${pose.rot}deg)`,
          transformOrigin: 'center center',
          transition: 'none',
          filter: dinoShadow,
          willChange: 'transform',
          userSelect: 'none',
        }}
      />
    </Box>
  )
}

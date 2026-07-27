import { useEffect, useRef } from 'react'
import { Box } from '@mui/material'
import { dinoShadow } from '../theme/tokens'
import { FLYER_FLAP_FRAMES } from '../lib/flyerFlapFrames'
import { clamp01, easeInOut } from '../lib/ambientMotion'
import {
  flyerDinoScreenRect,
  opacityOverContent,
} from '../lib/ambientContentFade'

const N_FRAMES = FLYER_FLAP_FRAMES.length
const FLIGHT_MS = 17000
const FLAP_FRAME_MS = 95
const START_DELAY_MS = 4000
const PAUSE_MS = 45000
const OPACITY_EVERY = 4

/** 只走高空／中上帶，避免與地上甲龍／角龍擦撞 */
const SPAWNS = [
  { id: 'rightHigh', y0: 0.06, y1: 0.18, kind: 'soar' },
  { id: 'rightMid', y0: 0.16, y1: 0.3, kind: 'weave' },
  { id: 'topRight', y0: -0.04, y1: 0.26, kind: 'arc' },
  { id: 'rightDive', y0: 0.12, y1: 0.34, kind: 'glide' },
  { id: 'rightClimb', y0: 0.32, y1: 0.12, kind: 'arc' },
  { id: 'highWeave', y0: 0.1, y1: 0.24, kind: 'weave' },
]

function samplePath(progress, spawn, size, w, h) {
  const p = easeInOut(progress)
  const p2 = easeInOut(progress + 0.005)
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
  const pitch =
    (Math.atan2(yAt(p2) - y, Math.abs(xAt(p2) - x) + 0.001) * 180) / Math.PI
  return { x, y, rot: pitch, size }
}

/** 翼手龍飛行：直接改 DOM，避免每幀 React setState 卡住導覽 */
export default function AmbientFlyer() {
  const imgRef = useRef(null)
  const rafRef = useRef(0)
  const flightRef = useRef(null)
  const flapRef = useRef({ frame: 0, lastTs: 0, drawn: -1 })
  const tickN = useRef(0)

  useEffect(() => {
    FLYER_FLAP_FRAMES.forEach((src) => {
      const img = new Image()
      img.src = src
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    let startTimer = 0
    const img = imgRef.current

    const hide = () => {
      if (!img) return
      img.style.visibility = 'hidden'
      img.style.opacity = '0'
    }

    const startFlight = () => {
      if (cancelled || !img) return
      const spawn = SPAWNS[Math.floor(Math.random() * SPAWNS.length)]
      const size = window.innerWidth < 600 ? 150 : 220
      flapRef.current = { frame: 0, lastTs: performance.now(), drawn: -1 }
      tickN.current = 0
      flightRef.current = {
        spawn,
        duration: FLIGHT_MS + Math.floor(Math.random() * 3500) - 1200,
        size,
        startedAt: performance.now(),
      }
      img.style.width = `${size}px`
      img.style.visibility = 'visible'

      const tick = (now) => {
        if (cancelled || !flightRef.current || !img) return
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
          hide()
          startTimer = window.setTimeout(startFlight, PAUSE_MS)
          return
        }

        const pos = samplePath(
          clamp01(progress),
          sp,
          sz,
          window.innerWidth,
          window.innerHeight,
        )

        if (flap.drawn !== flap.frame) {
          flap.drawn = flap.frame
          img.src = FLYER_FLAP_FRAMES[flap.frame]
        }
        img.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) rotate(${pos.rot}deg)`

        tickN.current += 1
        if (tickN.current % OPACITY_EVERY === 1) {
          img.style.opacity = String(
            opacityOverContent(
              flyerDinoScreenRect({ x: pos.x, y: pos.y, size: sz }),
              { clear: 0.78, ghost: 0.08 },
            ),
          )
        }

        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    hide()
    startTimer = window.setTimeout(startFlight, START_DELAY_MS)
    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      window.clearTimeout(startTimer)
    }
  }, [])

  return (
    <Box
      aria-hidden
      sx={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      <Box
        component='img'
        ref={imgRef}
        src={FLYER_FLAP_FRAMES[0]}
        alt=''
        sx={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 220,
          height: 'auto',
          display: 'block',
          visibility: 'hidden',
          opacity: 0,
          transformOrigin: 'center center',
          filter: dinoShadow,
          willChange: 'transform, opacity',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      />
    </Box>
  )
}

import { useEffect, useRef } from 'react'
import { Box } from '@mui/material'
import { REX_RUN_FRAMES } from '../lib/rexRunFrames'
import { easeInOut } from '../lib/ambientMotion'
import {
  groundDinoScreenRect,
  opacityOverContent,
} from '../lib/ambientContentFade'

const N_FRAMES = REX_RUN_FRAMES.length
const RUN_MS = 13000
const RUN_FRAME_MS = 90
const START_DELAY_MS = 900
const OPACITY_EVERY = 4

const ROUTES = [
  { id: 'weave', kind: 'weave', bobAmp: 22, bobFreq: 2.4, baseBottom: 0.07 },
  { id: 'hop', kind: 'hop', bobAmp: 30, bobFreq: 3.6, baseBottom: 0.06 },
  { id: 'climb', kind: 'slope', y0: 8, y1: -36, baseBottom: 0.05 },
  { id: 'descend', kind: 'slope', y0: -28, y1: 18, baseBottom: 0.09 },
  { id: 'meander', kind: 'meander', bobAmp: 26, bobFreq: 1.5, baseBottom: 0.08 },
  { id: 'dashBounce', kind: 'hop', bobAmp: 16, bobFreq: 5.2, baseBottom: 0.065 },
  { id: 'sCurve', kind: 'scurve', bobAmp: 34, baseBottom: 0.07 },
]

function sampleGroundPath(progress, route, size, w) {
  const p = easeInOut(progress)
  const p2 = easeInOut(progress + 0.008)
  const span = w + size * 2
  const x = -size + span * p
  const x2 = -size + span * p2

  const yAt = (pp) => {
    if (route.kind === 'weave') {
      return Math.sin(pp * Math.PI * route.bobFreq) * route.bobAmp
    }
    if (route.kind === 'hop') {
      return -Math.abs(Math.sin(pp * Math.PI * route.bobFreq)) * route.bobAmp
    }
    if (route.kind === 'slope') {
      return route.y0 + (route.y1 - route.y0) * pp
    }
    if (route.kind === 'meander') {
      return (
        Math.sin(pp * Math.PI * route.bobFreq) * route.bobAmp +
        Math.sin(pp * Math.PI * 3.1) * (route.bobAmp * 0.35)
      )
    }
    return Math.sin(pp * Math.PI * 2) * route.bobAmp * 0.55
  }

  const y = yAt(p)
  const lean =
    (Math.atan2(yAt(p2) - y, Math.abs(x2 - x) + 0.001) * 180) / Math.PI

  return {
    x,
    y,
    lean: Math.max(-10, Math.min(10, lean * 0.85)),
    size,
    baseBottom: route.baseBottom,
  }
}

/** 角龍奔跑：跑完一次後通知排程器，由排程器決定下隻地上龍 */
export default function AmbientRexRunner({ onFinished }) {
  const imgRef = useRef(null)
  const rafRef = useRef(0)
  const runRef = useRef(null)
  const frameRef = useRef({ frame: 0, lastTs: 0, drawn: -1 })
  const tickN = useRef(0)
  const finishedRef = useRef(false)
  const onFinishedRef = useRef(onFinished)
  onFinishedRef.current = onFinished

  useEffect(() => {
    REX_RUN_FRAMES.forEach((src) => {
      const img = new Image()
      img.src = src
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    let startTimer = 0
    const img = imgRef.current
    finishedRef.current = false

    const hide = () => {
      if (!img) return
      img.style.visibility = 'hidden'
      img.style.opacity = '0'
    }

    const finish = () => {
      if (finishedRef.current) return
      finishedRef.current = true
      hide()
      onFinishedRef.current?.()
    }

    const beginRun = () => {
      if (cancelled || !img) {
        finish()
        return
      }
      const size = window.innerWidth < 600 ? 96 : 132
      const route = ROUTES[Math.floor(Math.random() * ROUTES.length)]
      frameRef.current = { frame: 0, lastTs: performance.now(), drawn: -1 }
      tickN.current = 0
      runRef.current = {
        duration: RUN_MS + Math.floor(Math.random() * 2800) - 800,
        size,
        route,
        startedAt: performance.now(),
      }
      img.style.width = `${size}px`
      img.style.bottom = `${route.baseBottom * 100}%`
      img.style.visibility = 'visible'

      const tick = (now) => {
        if (cancelled || !runRef.current || !img) return
        const { duration: d, size: sz, route: rt, startedAt: t0 } =
          runRef.current
        const progress = (now - t0) / d

        const fr = frameRef.current
        if (now - fr.lastTs >= RUN_FRAME_MS) {
          const steps = Math.floor((now - fr.lastTs) / RUN_FRAME_MS)
          fr.frame = (fr.frame + steps) % N_FRAMES
          fr.lastTs += steps * RUN_FRAME_MS
        }

        if (progress >= 1) {
          finish()
          return
        }

        const pos = sampleGroundPath(progress, rt, sz, window.innerWidth)
        if (fr.drawn !== fr.frame) {
          fr.drawn = fr.frame
          img.src = REX_RUN_FRAMES[fr.frame]
        }
        img.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) rotate(${pos.lean}deg)`

        tickN.current += 1
        if (tickN.current % OPACITY_EVERY === 1) {
          img.style.opacity = String(
            opacityOverContent(
              groundDinoScreenRect({
                x: pos.x,
                y: pos.y,
                size: sz,
                baseBottom: pos.baseBottom,
              }),
            ),
          )
        }

        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    hide()
    startTimer = window.setTimeout(beginRun, START_DELAY_MS)
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
        src={REX_RUN_FRAMES[0]}
        alt=''
        sx={{
          position: 'absolute',
          left: 0,
          bottom: '7%',
          width: 132,
          height: 'auto',
          display: 'block',
          visibility: 'hidden',
          opacity: 0,
          transformOrigin: 'center bottom',
          filter: 'drop-shadow(0 6px 8px rgba(74,69,63,0.18))',
          willChange: 'transform, opacity',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      />
    </Box>
  )
}

import { useEffect, useRef } from 'react'
import { Box } from '@mui/material'
import { ARMOR_PLAN_FRAMES } from '../lib/armorPlanFrames'
import { easeInOut, easeSurvey } from '../lib/ambientMotion'
import {
  groundDinoScreenRect,
  opacityOverContent,
} from '../lib/ambientContentFade'

const N_FRAMES = ARMOR_PLAN_FRAMES.length
const WALK_MS = 18000
const PLAN_FRAME_MS = 150
const START_DELAY_MS = 900
const OPACITY_EVERY = 4

const ROUTES = [
  { id: 'amble', kind: 'weave', bobAmp: 14, bobFreq: 1.6, baseBottom: 0.12, easing: 'inout' },
  { id: 'survey', kind: 'weave', bobAmp: 10, bobFreq: 2.0, baseBottom: 0.13, easing: 'survey' },
  { id: 'climbPath', kind: 'slope', y0: 12, y1: -28, baseBottom: 0.1, easing: 'inout' },
  { id: 'downPath', kind: 'slope', y0: -22, y1: 16, baseBottom: 0.14, easing: 'inout' },
  { id: 'zigzag', kind: 'meander', bobAmp: 20, bobFreq: 1.2, baseBottom: 0.115, easing: 'inout' },
  { id: 'patrol', kind: 'scurve', bobAmp: 24, baseBottom: 0.125, easing: 'survey' },
  { id: 'nearEdge', kind: 'weave', bobAmp: 12, bobFreq: 2.8, baseBottom: 0.09, easing: 'inout' },
]

function sampleGroundPath(progress, route, size, w) {
  const ease = route.easing === 'survey' ? easeSurvey : easeInOut
  const p = ease(progress)
  const p2 = ease(progress + 0.008)
  const span = w + size * 2
  const x = w - span * p
  const x2 = w - span * p2

  const yAt = (pp) => {
    if (route.kind === 'weave') {
      return Math.sin(pp * Math.PI * route.bobFreq) * route.bobAmp
    }
    if (route.kind === 'slope') {
      return route.y0 + (route.y1 - route.y0) * pp
    }
    if (route.kind === 'meander') {
      return (
        Math.sin(pp * Math.PI * route.bobFreq) * route.bobAmp +
        Math.sin(pp * Math.PI * 2.7) * (route.bobAmp * 0.4)
      )
    }
    return Math.sin(pp * Math.PI * 2) * route.bobAmp * 0.5
  }

  const y = yAt(p)
  const lean =
    (Math.atan2(yAt(p2) - y, Math.abs(x2 - x) + 0.001) * 180) / Math.PI

  return {
    x,
    y,
    lean: Math.max(-6, Math.min(6, lean * 0.55)),
    size,
    baseBottom: route.baseBottom,
  }
}

/** 甲龍踱步：跑完一次後通知排程器，由排程器決定下隻地上龍 */
export default function AmbientArmorPlanner({ onFinished }) {
  const imgRef = useRef(null)
  const rafRef = useRef(0)
  const walkRef = useRef(null)
  const frameRef = useRef({ frame: 0, lastTs: 0, drawn: -1 })
  const tickN = useRef(0)
  const finishedRef = useRef(false)
  const onFinishedRef = useRef(onFinished)
  onFinishedRef.current = onFinished

  useEffect(() => {
    ARMOR_PLAN_FRAMES.forEach((src) => {
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

    const beginWalk = () => {
      if (cancelled || !img) {
        finish()
        return
      }
      const size = window.innerWidth < 600 ? 100 : 138
      const route = ROUTES[Math.floor(Math.random() * ROUTES.length)]
      frameRef.current = { frame: 0, lastTs: performance.now(), drawn: -1 }
      tickN.current = 0
      walkRef.current = {
        duration: WALK_MS + Math.floor(Math.random() * 3500) - 1000,
        size,
        route,
        startedAt: performance.now(),
      }
      img.style.width = `${size}px`
      img.style.bottom = `${route.baseBottom * 100}%`
      img.style.visibility = 'visible'

      const tick = (now) => {
        if (cancelled || !walkRef.current || !img) return
        const { duration: d, size: sz, route: rt, startedAt: t0 } =
          walkRef.current
        const progress = (now - t0) / d

        const fr = frameRef.current
        if (now - fr.lastTs >= PLAN_FRAME_MS) {
          const steps = Math.floor((now - fr.lastTs) / PLAN_FRAME_MS)
          fr.frame = (fr.frame + steps) % N_FRAMES
          fr.lastTs += steps * PLAN_FRAME_MS
        }

        if (progress >= 1) {
          finish()
          return
        }

        const pos = sampleGroundPath(progress, rt, sz, window.innerWidth)
        if (fr.drawn !== fr.frame) {
          fr.drawn = fr.frame
          img.src = ARMOR_PLAN_FRAMES[fr.frame]
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
                aspect: 0.75,
              }),
            ),
          )
        }

        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    hide()
    startTimer = window.setTimeout(beginWalk, START_DELAY_MS)
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
        src={ARMOR_PLAN_FRAMES[0]}
        alt=''
        sx={{
          position: 'absolute',
          left: 0,
          bottom: '12%',
          width: 138,
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

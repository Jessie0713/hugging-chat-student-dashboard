import { useEffect, useRef, useState } from 'react'
import { Box } from '@mui/material'
import { REX_RUN_FRAMES } from '../lib/rexRunFrames'

const N_FRAMES = REX_RUN_FRAMES.length
const RUN_MS = 13000
const RUN_FRAME_MS = 90
const START_DELAY_MS = 800

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
}

function clamp01(t) {
  return Math.min(1, Math.max(0, t))
}

/**
 * 角龍在棲地地面由左往右奔跑（儀表板後方）。
 * active / onFinished 由 AmbientGroundExclusive 控制，與甲龍互斥。
 */
export default function AmbientRexRunner({ active = true, onFinished }) {
  const [pose, setPose] = useState(null)
  const rafRef = useRef(0)
  const runRef = useRef(null)
  const frameRef = useRef({ frame: 0, lastTs: 0 })
  const onFinishedRef = useRef(onFinished)
  onFinishedRef.current = onFinished

  useEffect(() => {
    REX_RUN_FRAMES.forEach((src) => {
      const img = new Image()
      img.src = src
    })
  }, [])

  useEffect(() => {
    if (!active) {
      setPose(null)
      return undefined
    }

    let cancelled = false
    let startTimer = 0

    const startRun = () => {
      if (cancelled) return
      const w = window.innerWidth
      const size = w < 600 ? 96 : 132
      const duration = RUN_MS + Math.floor(Math.random() * 2000) - 600
      frameRef.current = { frame: 0, lastTs: performance.now() }
      runRef.current = {
        duration,
        size,
        startedAt: performance.now(),
      }

      const tick = (now) => {
        if (cancelled || !runRef.current) return
        const { duration: d, size: sz, startedAt: t0 } = runRef.current
        const progress = (now - t0) / d

        const fr = frameRef.current
        if (now - fr.lastTs >= RUN_FRAME_MS) {
          const steps = Math.floor((now - fr.lastTs) / RUN_FRAME_MS)
          fr.frame = (fr.frame + steps) % N_FRAMES
          fr.lastTs += steps * RUN_FRAME_MS
        }

        if (progress >= 1) {
          setPose(null)
          onFinishedRef.current?.()
          return
        }

        const p = easeInOut(clamp01(progress))
        const x = -sz + (w + sz * 2) * p
        setPose({ x, size: sz, frame: fr.frame })
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    startTimer = window.setTimeout(startRun, START_DELAY_MS)

    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      window.clearTimeout(startTimer)
    }
  }, [active])

  if (!active || !pose) return null

  return (
    <Box
      aria-hidden
      sx={{
        position: 'fixed',
        inset: 0,
        m: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      <Box
        component='img'
        src={REX_RUN_FRAMES[pose.frame]}
        alt=''
        sx={{
          position: 'absolute',
          left: 0,
          bottom: { xs: '6%', sm: '7%', md: '8%' },
          width: pose.size,
          height: 'auto',
          m: 0,
          display: 'block',
          opacity: 0.9,
          transform: `translate3d(${pose.x}px, 0, 0)`,
          transformOrigin: 'center bottom',
          transition: 'none',
          // 輕柔立體感；貼地陰影已在幀圖內
          filter: 'drop-shadow(0 6px 8px rgba(74,69,63,0.18))',
          willChange: 'transform',
          userSelect: 'none',
        }}
      />
    </Box>
  )
}

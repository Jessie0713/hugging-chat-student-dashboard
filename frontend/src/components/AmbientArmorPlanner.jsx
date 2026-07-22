import { useEffect, useRef, useState } from 'react'
import { Box } from '@mui/material'
import { ARMOR_PLAN_FRAMES } from '../lib/armorPlanFrames'

const N_FRAMES = ARMOR_PLAN_FRAMES.length
const WALK_MS = 18000
const PLAN_FRAME_MS = 150
const START_DELAY_MS = 800

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
}

function clamp01(t) {
  return Math.min(1, Math.max(0, t))
}

/**
 * 甲龍在棲地中低處由右往左踱步「勘查定策」（儀表板後方）。
 * active / onFinished 由 AmbientGroundExclusive 控制，與角龍互斥。
 */
export default function AmbientArmorPlanner({
  active = true,
  onFinished,
}) {
  const [pose, setPose] = useState(null)
  const rafRef = useRef(0)
  const walkRef = useRef(null)
  const frameRef = useRef({ frame: 0, lastTs: 0 })
  const onFinishedRef = useRef(onFinished)
  onFinishedRef.current = onFinished

  useEffect(() => {
    ARMOR_PLAN_FRAMES.forEach((src) => {
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

    const startWalk = () => {
      if (cancelled) return
      const w = window.innerWidth
      const size = w < 600 ? 100 : 138
      const duration = WALK_MS + Math.floor(Math.random() * 2500) - 800
      frameRef.current = { frame: 0, lastTs: performance.now() }
      walkRef.current = {
        duration,
        size,
        startedAt: performance.now(),
      }

      const tick = (now) => {
        if (cancelled || !walkRef.current) return
        const { duration: d, size: sz, startedAt: t0 } = walkRef.current
        const progress = (now - t0) / d

        const fr = frameRef.current
        if (now - fr.lastTs >= PLAN_FRAME_MS) {
          const steps = Math.floor((now - fr.lastTs) / PLAN_FRAME_MS)
          fr.frame = (fr.frame + steps) % N_FRAMES
          fr.lastTs += steps * PLAN_FRAME_MS
        }

        if (progress >= 1) {
          setPose(null)
          onFinishedRef.current?.()
          return
        }

        const p = easeInOut(clamp01(progress))
        const x = w - (w + sz * 2) * p
        setPose({ x, size: sz, frame: fr.frame })
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    startTimer = window.setTimeout(startWalk, START_DELAY_MS)

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
        src={ARMOR_PLAN_FRAMES[pose.frame]}
        alt=''
        sx={{
          position: 'absolute',
          left: 0,
          bottom: { xs: '10%', sm: '12%', md: '14%' },
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

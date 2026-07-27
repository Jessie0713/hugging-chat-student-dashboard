import { useEffect, useRef, useState } from 'react'
import AmbientFlyer from './AmbientFlyer'
import AmbientArmorPlanner from './AmbientArmorPlanner'
import AmbientRexRunner from './AmbientRexRunner'

/** 跑完後空場，再休息，然後換另一隻地上龍 */
const GROUND_CLEAR_MS = 8000
const GROUND_PAUSE_MS = 28000

/**
 * 翼手龍可獨立飛行；地上甲龍／角龍一次只掛載一隻，避免路線對撞。
 */
export default function AmbientDinoScheduler() {
  const [enabled, setEnabled] = useState(() => {
    if (typeof window === 'undefined') return true
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })
  const [groundWho, setGroundWho] = useState('armor')
  const nextGroundRef = useRef('rex')
  const pauseTimerRef = useRef(0)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => {
      const on = !mq.matches
      setEnabled(on)
      if (!on) {
        window.clearTimeout(pauseTimerRef.current)
        setGroundWho(null)
      } else {
        setGroundWho((w) => w ?? 'armor')
      }
    }
    sync()
    mq.addEventListener?.('change', sync)
    return () => {
      mq.removeEventListener?.('change', sync)
      window.clearTimeout(pauseTimerRef.current)
    }
  }, [])

  const handleGroundFinished = (finishedWho) => {
    nextGroundRef.current = finishedWho === 'armor' ? 'rex' : 'armor'
    setGroundWho(null)
    window.clearTimeout(pauseTimerRef.current)
    pauseTimerRef.current = window.setTimeout(() => {
      setGroundWho(nextGroundRef.current)
    }, GROUND_CLEAR_MS + GROUND_PAUSE_MS)
  }

  if (!enabled) return null

  return (
    <>
      <AmbientFlyer />
      {groundWho === 'armor' ? (
        <AmbientArmorPlanner
          key='armor'
          onFinished={() => handleGroundFinished('armor')}
        />
      ) : null}
      {groundWho === 'rex' ? (
        <AmbientRexRunner
          key='rex'
          onFinished={() => handleGroundFinished('rex')}
        />
      ) : null}
    </>
  )
}

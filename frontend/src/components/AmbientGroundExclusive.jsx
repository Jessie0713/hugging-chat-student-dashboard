import { useEffect, useRef, useState } from 'react'
import AmbientArmorPlanner from './AmbientArmorPlanner'
import AmbientRexRunner from './AmbientRexRunner'

const PAUSE_MS = 20000

/**
 * 地面恐龍互斥：甲龍出現時角龍不出現，反之亦然；中間休息後輪替。
 */
export default function AmbientGroundExclusive() {
  const [who, setWho] = useState('armor')
  const nextRef = useRef('rex')
  const pauseTimerRef = useRef(0)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => {
      if (mq.matches) {
        setWho(null)
      } else {
        setWho((w) => w ?? 'armor')
      }
    }
    sync()
    mq.addEventListener?.('change', sync)
    return () => {
      mq.removeEventListener?.('change', sync)
      window.clearTimeout(pauseTimerRef.current)
    }
  }, [])

  const handleFinished = (finishedWho) => {
    nextRef.current = finishedWho === 'armor' ? 'rex' : 'armor'
    setWho(null)
    window.clearTimeout(pauseTimerRef.current)
    pauseTimerRef.current = window.setTimeout(() => {
      setWho(nextRef.current)
    }, PAUSE_MS)
  }

  if (!who) return null

  return who === 'armor' ? (
    <AmbientArmorPlanner
      key='armor'
      active
      onFinished={() => handleFinished('armor')}
    />
  ) : (
    <AmbientRexRunner
      key='rex'
      active
      onFinished={() => handleFinished('rex')}
    />
  )
}

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import AmbientFlyer from './AmbientFlyer'
import AmbientArmorPlanner from './AmbientArmorPlanner'
import AmbientRexRunner from './AmbientRexRunner'
import { apiGet } from '../lib/api'
import {
  BADGE_UNLOCK,
  filterActiveEarnedIds,
} from '../lib/badgeDefinitions'

/** 跑完後空場，再休息，然後換另一隻地上龍 */
const GROUND_CLEAR_MS = 8000
const GROUND_PAUSE_MS = 28000

function pickFirstGround(unlocks) {
  if (unlocks.armor) return 'armor'
  if (unlocks.rex) return 'rex'
  return null
}

function pickNextGround(finishedWho, unlocks) {
  const order = []
  if (unlocks.armor) order.push('armor')
  if (unlocks.rex) order.push('rex')
  if (order.length === 0) return null
  if (order.length === 1) return order[0]
  return finishedWho === 'armor' ? 'rex' : 'armor'
}

/**
 * 依獎章解鎖氛圍恐龍：
 * - 翼手龍觀察 → 飛行
 * - 甲龍就緒 → 甲龍
 * - 十棲地王者 → 角龍
 * 地上甲龍／角龍一次只掛載一隻。
 */
export default function AmbientDinoScheduler() {
  const { source, hfUserId } = useParams()
  const [motionOk, setMotionOk] = useState(() => {
    if (typeof window === 'undefined') return true
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })
  const [unlocks, setUnlocks] = useState({
    flyer: false,
    armor: false,
    rex: false,
  })
  const [groundWho, setGroundWho] = useState(null)
  const nextGroundRef = useRef(null)
  const pauseTimerRef = useRef(0)
  const unlocksRef = useRef(unlocks)
  const motionOkRef = useRef(motionOk)
  unlocksRef.current = unlocks
  motionOkRef.current = motionOk

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => {
      const on = !mq.matches
      setMotionOk(on)
      if (!on) {
        window.clearTimeout(pauseTimerRef.current)
        setGroundWho(null)
      } else {
        setGroundWho((w) => w ?? pickFirstGround(unlocksRef.current))
      }
    }
    sync()
    mq.addEventListener?.('change', sync)
    return () => {
      mq.removeEventListener?.('change', sync)
      window.clearTimeout(pauseTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!source || !hfUserId) return undefined
    let cancelled = false

    apiGet(`/api/${source}/student/${hfUserId}/badges`)
      .then((d) => {
        if (cancelled) return
        const earned = new Set(
          filterActiveEarnedIds(d?.badge?.earnedIds, d?.badgeDefinitions),
        )
        const next = {
          flyer: earned.has(BADGE_UNLOCK.flyer),
          armor: earned.has(BADGE_UNLOCK.armor),
          rex: earned.has(BADGE_UNLOCK.rex),
        }
        setUnlocks(next)
        window.clearTimeout(pauseTimerRef.current)
        setGroundWho((prev) => {
          if (!motionOkRef.current) return null
          if (prev === 'armor' && next.armor) return 'armor'
          if (prev === 'rex' && next.rex) return 'rex'
          return pickFirstGround(next)
        })
      })
      .catch(() => {
        if (cancelled) return
        setUnlocks({ flyer: false, armor: false, rex: false })
        window.clearTimeout(pauseTimerRef.current)
        setGroundWho(null)
      })

    return () => {
      cancelled = true
    }
  }, [source, hfUserId])

  const handleGroundFinished = (finishedWho) => {
    const next = pickNextGround(finishedWho, unlocksRef.current)
    nextGroundRef.current = next
    setGroundWho(null)
    window.clearTimeout(pauseTimerRef.current)
    if (!next) return
    pauseTimerRef.current = window.setTimeout(() => {
      setGroundWho(nextGroundRef.current)
    }, GROUND_CLEAR_MS + GROUND_PAUSE_MS)
  }

  if (!motionOk) return null

  return (
    <>
      {unlocks.flyer ? <AmbientFlyer /> : null}
      {groundWho === 'armor' && unlocks.armor ? (
        <AmbientArmorPlanner
          key='armor'
          onFinished={() => handleGroundFinished('armor')}
        />
      ) : null}
      {groundWho === 'rex' && unlocks.rex ? (
        <AmbientRexRunner
          key='rex'
          onFinished={() => handleGroundFinished('rex')}
        />
      ) : null}
    </>
  )
}

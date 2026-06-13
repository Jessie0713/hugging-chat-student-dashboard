import { useParams } from 'react-router-dom'
import Overview from './Overview'

const FIXED_LEVEL_SOURCES = new Set(['fixed_level', 'huggingchat'])

export default function OverviewPage() {
  const { source } = useParams()
  const isFixedLevel = FIXED_LEVEL_SOURCES.has((source || '').toLowerCase())

  if (isFixedLevel) {
    return (
      <Overview
        showOverallCefrTrend={false}
        showCefrAdvice={false}
        useScenarioLevels
        fixedLevelErrorHint
      />
    )
  }

  return <Overview />
}


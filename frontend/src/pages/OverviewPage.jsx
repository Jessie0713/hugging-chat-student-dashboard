import { useParams } from 'react-router-dom'
import Overview from './Overview'
import OverviewHuggingchat from './OverviewHuggingchat'

export default function OverviewPage() {
  const { source } = useParams()

  if ((source || '').toLowerCase() === 'huggingchat') {
    return <OverviewHuggingchat />
  }

  return <Overview />
}


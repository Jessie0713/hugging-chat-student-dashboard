// src/pages/Badges.jsx
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material'
import { apiGet } from '../lib/api'
import {
  filterActiveEarnedIds,
  hydrateBadgeDefinitions,
} from '../lib/badgeDefinitions'

function BadgeSlot({ unlocked, icon, iconUrl, title, subtitle }) {
  return (
    <Stack alignItems='center' spacing={0.5} sx={{ width: 88 }}>
      <Box
        sx={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          border: '1px solid',
          borderColor: unlocked ? 'primary.main' : 'divider',
          display: 'grid',
          placeItems: 'center',
          bgcolor: unlocked ? 'action.hover' : 'background.paper',
          fontWeight: 800,
          fontSize: 28,
          overflow: 'hidden',
          p: unlocked && iconUrl ? 0.75 : 0,
        }}
        title={title}
      >
        {unlocked ? (
          iconUrl ? (
            <Box
              component='img'
              src={iconUrl}
              alt={title}
              sx={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          ) : (
            icon
          )
        ) : (
          '?'
        )}
      </Box>
      <Typography
        variant='caption'
        sx={{
          fontWeight: 700,
          textAlign: 'center',
          lineHeight: 1.2,
          opacity: unlocked ? 1 : 0.6,
        }}
      >
        {title}
      </Typography>
      {subtitle ? (
        <Typography variant='caption' sx={{ opacity: 0.55, fontSize: '0.65rem' }}>
          {subtitle}
        </Typography>
      ) : null}
    </Stack>
  )
}

export default function Badges() {
  const { source, hfUserId } = useParams()
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const loading = !data && !err

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled) {
        setErr('')
        setData(null)
      }
    })
    apiGet(`/api/${source}/student/${hfUserId}/badges`)
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((e) => {
        if (!cancelled) setErr(String(e))
      })
    return () => {
      cancelled = true
    }
  }, [source, hfUserId])

  const badgeDefs = useMemo(
    () => hydrateBadgeDefinitions(data?.badgeDefinitions),
    [data?.badgeDefinitions],
  )
  const earnedSet = useMemo(() => {
    const ids = filterActiveEarnedIds(
      data?.badge?.earnedIds,
      data?.badgeDefinitions,
    )
    return new Set(ids)
  }, [data])

  const slots = useMemo(
    () =>
      badgeDefs.map((b) => ({
        id: b.id,
        unlocked: earnedSet.has(b.id),
        icon: b.icon,
        iconUrl: b.iconUrl,
        title: b.name,
        subtitle: b.gradeNote,
      })),
    [badgeDefs, earnedSet],
  )

  const earnedCount = slots.filter((s) => s.unlocked).length

  return (
    <Box>
      <Typography variant='h5' sx={{ fontWeight: 700, mb: 2 }}>
        恐龍探險獎章
      </Typography>

      <Card variant='outlined'>
        <CardContent>
          <Stack
            direction='row'
            alignItems='center'
            spacing={1}
            sx={{ mb: 2 }}
            flexWrap='wrap'
            useFlexGap
          >
            <Typography variant='h6' sx={{ fontWeight: 700 }}>
              已獲得獎章
            </Typography>
            <Chip
              size='small'
              label={`${earnedCount} / ${slots.length}`}
              color='primary'
              variant='outlined'
            />
          </Stack>

          {err ? (
            <Typography color='error' sx={{ whiteSpace: 'pre-wrap' }}>
              {err}
            </Typography>
          ) : loading ? (
            <CircularProgress size={22} />
          ) : (
            <Stack direction='row' flexWrap='wrap' useFlexGap spacing={2}>
              {slots.map((s) => (
                <BadgeSlot
                  key={s.id}
                  unlocked={s.unlocked}
                  icon={s.icon}
                  iconUrl={s.iconUrl}
                  title={s.title}
                  subtitle={s.subtitle}
                />
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>
    </Box>
  )
}

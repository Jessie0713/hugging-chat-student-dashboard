import { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { apiGet, apiPost, apiPut } from '../lib/api'
import { assistantHeaders } from '../lib/assistantAuth'
import { buttonPrimarySx, buttonSecondarySx, colors, radii, type } from '../theme/tokens'

function emptyNode() {
  return {
    id: `node_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    label: '新節點',
    aliases: [],
    text: '',
  }
}

export default function AdminGraphEditor() {
  const [graph, setGraph] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const [savedHint, setSavedHint] = useState('')
  const [resetOnce, setResetOnce] = useState(false)
  const [openId, setOpenId] = useState('')

  const load = () => {
    setErr('')
    apiGet('/api/assistant/admin/graph', { headers: assistantHeaders() })
      .then((data) => {
        setGraph({
          id: data.id || 'teacher-graph',
          title: data.title || '教師知識圖譜',
          nodes: data.nodes || [],
          edges: data.edges || [],
          stored: data.stored,
          updatedAt: data.updatedAt,
          updatedBy: data.updatedBy,
          seededFromFile: data.seededFromFile,
        })
      })
      .catch((e) => setErr(String(e.message || e)))
  }

  useEffect(() => {
    load()
  }, [])

  const nodeIds = useMemo(() => (graph?.nodes || []).map((n) => n.id), [graph])

  const patchGraph = (fn) => {
    setSavedHint('')
    setGraph((prev) => (prev ? fn(prev) : prev))
  }

  const save = async () => {
    if (!graph) return
    setBusy('save')
    setErr('')
    try {
      const data = await apiPut(
        '/api/assistant/admin/graph',
        {
          id: graph.id,
          title: graph.title,
          nodes: graph.nodes,
          edges: graph.edges,
        },
        { headers: assistantHeaders() },
      )
      setGraph({
        ...graph,
        ...data,
        nodes: data.nodes || graph.nodes,
        edges: data.edges || graph.edges,
      })
      setSavedHint('已寫入 Mongo，教師助手會用這份圖譜。')
    } catch (e) {
      setErr(String(e.message || e))
    } finally {
      setBusy('')
    }
  }

  const reset = async () => {
    if (!resetOnce) {
      setResetOnce(true)
      return
    }
    setBusy('reset')
    setErr('')
    setResetOnce(false)
    try {
      const data = await apiPost('/api/assistant/admin/graph/reset', {}, { headers: assistantHeaders() })
      setGraph({
        id: data.id,
        title: data.title,
        nodes: data.nodes || [],
        edges: data.edges || [],
        stored: data.stored,
        updatedAt: data.updatedAt,
        updatedBy: data.updatedBy,
        seededFromFile: data.seededFromFile,
      })
      setSavedHint('已用檔案種子覆蓋 Mongo。')
    } catch (e) {
      setErr(String(e.message || e))
    } finally {
      setBusy('')
    }
  }

  if (!graph) {
    return (
      <Card variant='outlined' sx={{ mb: 2, bgcolor: colors.paper, borderRadius: `${radii.lg}px` }}>
        <CardContent>
          <Typography sx={type.sectionTitle}>教師知識圖譜</Typography>
          <Typography sx={{ fontSize: 14, mt: 1 }}>{err || '讀取中…'}</Typography>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card variant='outlined' sx={{ mb: 2, bgcolor: colors.paper, borderRadius: `${radii.lg}px` }}>
      <CardContent>
        <Typography sx={type.sectionTitle}>教師知識圖譜</Typography>
        <Typography sx={{ fontSize: 13, color: colors.muted, my: 1 }}>
          現行版存在 Mongo。這裡改完按儲存，班級助教會改用這份，不必改程式檔。
        </Typography>
        <Stack direction='row' spacing={1} flexWrap='wrap' useFlexGap sx={{ mb: 1.5 }}>
          <Chip size='small' label={graph.stored ? '已存 Mongo' : '尚未寫入（顯示檔案種子）'} />
          <Chip size='small' label={`${graph.nodes.length} 個節點`} />
          <Chip size='small' label={`${graph.edges.length} 條關係`} />
          {graph.seededFromFile ? <Chip size='small' label='來源：檔案種子' variant='outlined' /> : null}
        </Stack>
        <Typography sx={{ fontSize: 12, color: colors.muted, mb: 1.5 }}>
          {graph.updatedAt ? `更新 ${graph.updatedAt}` : '尚未更新'}
          {graph.updatedBy ? ` · ${graph.updatedBy}` : ''}
        </Typography>
        {err ? <Typography color='error' sx={{ mb: 1, fontSize: 13 }}>{err}</Typography> : null}
        {savedHint ? <Typography sx={{ mb: 1, fontSize: 13, fontWeight: 700 }}>{savedHint}</Typography> : null}

        <TextField
          size='small'
          fullWidth
          label='圖譜標題'
          value={graph.title}
          onChange={(e) => patchGraph((g) => ({ ...g, title: e.target.value }))}
          sx={{ mb: 1.5 }}
        />

        <Typography sx={{ fontWeight: 800, fontSize: 13, mb: 0.75 }}>關係現況</Typography>
        {graph.edges.length === 0 ? (
          <Typography sx={{ fontSize: 13, color: colors.muted, mb: 1 }}>還沒有關係</Typography>
        ) : (
          <Box sx={{ mb: 1.5, p: 1, bgcolor: colors.wash, borderRadius: `${radii.md}px` }}>
            {graph.edges.map((e, i) => {
              const fromLabel = graph.nodes.find((n) => n.id === e.from)?.label || e.from
              const toLabel = graph.nodes.find((n) => n.id === e.to)?.label || e.to
              return (
                <Typography key={`${e.from}-${e.rel}-${e.to}-${i}`} sx={{ fontSize: 13 }}>
                  {fromLabel} —{e.rel}→ {toLabel}
                </Typography>
              )
            })}
          </Box>
        )}

        <Stack direction='row' spacing={1} sx={{ mb: 1 }} flexWrap='wrap' useFlexGap>
          <Button
            size='small'
            sx={buttonSecondarySx}
            onClick={() =>
              patchGraph((g) => ({
                ...g,
                edges: [...g.edges, { from: nodeIds[0] || '', rel: '相關', to: nodeIds[1] || nodeIds[0] || '' }],
              }))
            }
          >
            新增關係
          </Button>
        </Stack>
        {graph.edges.map((edge, i) => (
          <Stack key={`edge-${i}`} direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 1 }}>
            <TextField
              select
              size='small'
              label='從'
              value={edge.from}
              onChange={(e) =>
                patchGraph((g) => {
                  const edges = g.edges.map((x, idx) => (idx === i ? { ...x, from: e.target.value } : x))
                  return { ...g, edges }
                })
              }
              sx={{ minWidth: 140, flex: 1 }}
            >
              {graph.nodes.map((n) => (
                <MenuItem key={n.id} value={n.id}>{n.label || n.id}</MenuItem>
              ))}
            </TextField>
            <TextField
              size='small'
              label='關係'
              value={edge.rel}
              onChange={(e) =>
                patchGraph((g) => {
                  const edges = g.edges.map((x, idx) => (idx === i ? { ...x, rel: e.target.value } : x))
                  return { ...g, edges }
                })
              }
              sx={{ minWidth: 100 }}
            />
            <TextField
              select
              size='small'
              label='到'
              value={edge.to}
              onChange={(e) =>
                patchGraph((g) => {
                  const edges = g.edges.map((x, idx) => (idx === i ? { ...x, to: e.target.value } : x))
                  return { ...g, edges }
                })
              }
              sx={{ minWidth: 140, flex: 1 }}
            >
              {graph.nodes.map((n) => (
                <MenuItem key={n.id} value={n.id}>{n.label || n.id}</MenuItem>
              ))}
            </TextField>
            <Button
              size='small'
              onClick={() => patchGraph((g) => ({ ...g, edges: g.edges.filter((_, idx) => idx !== i) }))}
            >
              刪
            </Button>
          </Stack>
        ))}

        <Stack direction='row' alignItems='center' spacing={1} sx={{ mt: 2, mb: 1 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 13, flex: 1 }}>節點</Typography>
          <Button
            size='small'
            sx={buttonSecondarySx}
            onClick={() => patchGraph((g) => ({ ...g, nodes: [...g.nodes, emptyNode()] }))}
          >
            新增節點
          </Button>
        </Stack>
        {graph.nodes.map((node, i) => {
          const open = openId === node.id
          return (
            <Box key={`node-${i}-${node.id}`} sx={{ mb: 1, p: 1.25, bgcolor: colors.wash, borderRadius: `${radii.md}px` }}>
              <Stack direction='row' spacing={1} alignItems='center'>
                <Box sx={{ flex: 1, cursor: 'pointer' }} onClick={() => setOpenId(open ? '' : node.id)}>
                  <Typography sx={{ fontWeight: 800, fontSize: 14 }}>{node.label || node.id}</Typography>
                  <Typography sx={{ fontSize: 12, color: colors.muted }}>{node.id}</Typography>
                </Box>
                <Button size='small' onClick={() => setOpenId(open ? '' : node.id)}>
                  {open ? '收合' : '編輯'}
                </Button>
                <Button
                  size='small'
                  onClick={() =>
                    patchGraph((g) => ({
                      ...g,
                      nodes: g.nodes.filter((_, idx) => idx !== i),
                      edges: g.edges.filter((e) => e.from !== node.id && e.to !== node.id),
                    }))
                  }
                >
                  刪
                </Button>
              </Stack>
              {open ? (
                <Stack spacing={1} sx={{ mt: 1.25 }}>
                  <TextField
                    size='small'
                    label='id（檢索用，勿輕易改）'
                    value={node.id}
                    onChange={(e) => {
                      const nextId = e.target.value
                      patchGraph((g) => {
                        const old = g.nodes[i].id
                        const nodes = g.nodes.map((n, idx) => (idx === i ? { ...n, id: nextId } : n))
                        const edges = g.edges.map((edge) => ({
                          ...edge,
                          from: edge.from === old ? nextId : edge.from,
                          to: edge.to === old ? nextId : edge.to,
                        }))
                        return { ...g, nodes, edges }
                      })
                      setOpenId(nextId)
                    }}
                  />
                  <TextField
                    size='small'
                    label='顯示名稱'
                    value={node.label}
                    onChange={(e) =>
                      patchGraph((g) => {
                        const nodes = g.nodes.map((n, idx) => (idx === i ? { ...n, label: e.target.value } : n))
                        return { ...g, nodes }
                      })
                    }
                  />
                  <TextField
                    size='small'
                    label='別名（逗號分隔）'
                    value={(node.aliases || []).join('，')}
                    onChange={(e) =>
                      patchGraph((g) => {
                        const aliases = e.target.value.split(/[,，]/).map((x) => x.trim()).filter(Boolean)
                        const nodes = g.nodes.map((n, idx) => (idx === i ? { ...n, aliases } : n))
                        return { ...g, nodes }
                      })
                    }
                  />
                  <TextField
                    size='small'
                    multiline
                    minRows={3}
                    label='說明（助手會讀這段）'
                    value={node.text}
                    onChange={(e) =>
                      patchGraph((g) => {
                        const nodes = g.nodes.map((n, idx) => (idx === i ? { ...n, text: e.target.value } : n))
                        return { ...g, nodes }
                      })
                    }
                  />
                </Stack>
              ) : (
                <Typography sx={{ fontSize: 13, mt: 0.75, color: colors.ink, whiteSpace: 'pre-wrap' }}>
                  {(node.text || '').slice(0, 160)}{(node.text || '').length > 160 ? '…' : ''}
                </Typography>
              )}
            </Box>
          )
        })}

        <Stack direction='row' spacing={1} sx={{ mt: 2 }} flexWrap='wrap' useFlexGap>
          <Button sx={buttonPrimarySx} disabled={Boolean(busy)} onClick={save}>
            {busy === 'save' ? '儲存中…' : '儲存到 Mongo'}
          </Button>
          <Button sx={buttonSecondarySx} disabled={Boolean(busy)} onClick={reset}>
            {resetOnce ? '再按一次確認覆蓋' : busy === 'reset' ? '覆蓋中…' : '用檔案種子覆蓋'}
          </Button>
        </Stack>
      </CardContent>
    </Card>
  )
}

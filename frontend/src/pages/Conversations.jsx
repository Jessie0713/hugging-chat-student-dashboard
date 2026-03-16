// src/pages/Conversations.jsx
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Divider,
  Grid,
  Pagination,
  Stack,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Avatar,
  Skeleton,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome' // AI Icon
import AssessmentIcon from '@mui/icons-material/Assessment'
import { apiGet, apiPost } from '../lib/api'
import KeyboardVoiceOutlinedIcon from '@mui/icons-material/KeyboardVoiceOutlined'

// 輔助函式：格式化日期
const formatDate = (dateString) => {
  if (!dateString) return ''
  const d = new Date(dateString)
  return d.toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

// 輔助函式：根據 assistantId 產生隨機顏色 Avatar
const stringToColor = (string) => {
  let hash = 0
  if (!string) return '#bdbdbd'
  for (let i = 0; i < string.length; i += 1) {
    hash = string.charCodeAt(i) + ((hash << 5) - hash)
  }
  let color = '#'
  for (let i = 0; i < 3; i += 1) {
    const value = (hash >> (i * 8)) & 0xff
    color += `00${value.toString(16)}`.slice(-2)
  }
  return color
}
// 定義共用的樣式變數，方便統一高度
const commonCardStyle = {
  height: '65vh', // 設定固定高度 (或是用 px, e.g., '600px')
  display: 'flex',
  flexDirection: 'column',
  borderRadius: 3,
}

const scrollableContentStyle = {
  flex: 1, // 佔滿 Card 扣除標題後的剩餘空間
  overflowY: 'auto', // 內容超出時顯示捲軸
  p: 2, // 內距
}

export default function Conversations() {
  const { hfUserId } = useParams()

  // States
  const [list, setList] = useState(null) // 聊天記錄列表
  const [overview, setOverview] = useState(null) // 用於右側排行榜
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const limit = 10 // 配合截圖，一頁顯示少一點比較好看

  // AI Analysis States
  const [aiLoading, setAiLoading] = useState(false)
  const [aiText, setAiText] = useState('')

  // 1. 抓取聊天列表
  useEffect(() => {
    const skip = (page - 1) * limit
    setLoading(true)
    apiGet(`/api/student/${hfUserId}/conversations?skip=${skip}&limit=${limit}`)
      .then((data) => {
        setList(data)
        setLoading(false)
      })
      .catch((err) => {
        console.error(err)
        setLoading(false)
      })
  }, [hfUserId, page])

  // 2. 抓取 Overview 資料 (為了右側排行榜)
  useEffect(() => {
    apiGet(`/api/student/${hfUserId}/overview`)
      .then(setOverview)
      .catch(console.error)
  }, [hfUserId])

  // 處理分頁
  const totalPages = list
    ? Math.max(1, Math.ceil((list.total || 0) / limit))
    : 1

  return (
    <Box sx={{ pb: 8 }}>
      {/* 標題區 */}
      <Grid container spacing={3} alignItems='stretch'>
        <Grid item size={{ xs: 12 }}>
          <Card>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 1 }}>
              <Typography variant='h5' sx={{ fontWeight: 700 }}>
                總覽與評語
              </Typography>
              <Typography
                variant='body2'
                color='text.secondary'
                sx={{ mt: 0.5 }}
              >
                (hfUserId: {hfUserId})
              </Typography>
            </Box>

            {/* 上方 AI 分析區塊 (模仿截圖置中與按鈕樣式) */}

            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
              }}
            >
              {!aiText && (
                <>
                  <AutoAwesomeIcon
                    sx={{ fontSize: 40, color: 'primary.main', opacity: 0.8 }}
                  />
                  <Typography variant='h6' sx={{ fontWeight: 600 }}>
                    AI 語法健檢報告
                  </Typography>
                  <Typography variant='body2' color='text.secondary'>
                    點擊下方按鈕，讓 AI 分析您 整體 的對話並找出改進點。
                  </Typography>
                </>
              )}

              {aiText && (
                <Box
                  sx={{
                    textAlign: 'left',
                    width: '100%',
                    bgcolor: '#f5f9ff',
                    p: 3,
                    borderRadius: 2,
                  }}
                >
                  <Typography
                    variant='subtitle1'
                    fontWeight='bold'
                    gutterBottom
                  >
                    分析結果：
                  </Typography>
                  <Typography sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>
                    {aiText}
                  </Typography>
                </Box>
              )}

              {!aiText && (
                <Button
                  variant='contained'
                  size='large'
                  sx={{ color: '#fff', borderRadius: 20, px: 4, mt: 1 }}
                  startIcon={aiLoading ? null : <AutoAwesomeIcon />}
                  disabled={aiLoading}
                  onClick={async () => {
                    setAiLoading(true)
                    try {
                      const res = await apiPost(
                        `/api/student/${hfUserId}/ai-advice`,
                      )
                      setAiText(res.text || '')
                    } catch (e) {
                      alert('分析失敗: ' + e)
                    } finally {
                      setAiLoading(false)
                    }
                  }}
                >
                  {aiLoading ? '分析中...' : '開始分析'}
                </Button>
              )}
            </Box>
          </Card>
        </Grid>{' '}
        {/* 確保 Grid item 本身高度拉伸對齊 */}
        {/* 左側：聊天記錄 (Accordions) */}
        <Grid item size={{ xs: 7 }}>
          {/* 修正: size={{ xs: 6 }} 寫法可能依版本不同，建議用標準 xs/md */}
          <Card variant='outlined' sx={commonCardStyle}>
            {/* 標題區 (固定不動) */}
            <Box
              sx={{
                p: 2,
                borderBottom: '1px solid #eee',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Typography variant='h6' sx={{ fontWeight: 700 }}>
                聊天紀錄
              </Typography>
              <Typography
                variant='caption'
                sx={{ ml: 1, bgcolor: '#eee', px: 1, borderRadius: 1 }}
              >
                共 {list?.total || 0} 筆
              </Typography>
            </Box>

            {/* 列表內容區 (可捲動) */}
            <Box sx={scrollableContentStyle}>
              {loading ? (
                <Stack spacing={2}>
                  <Skeleton variant='rounded' height={60} />
                  <Skeleton variant='rounded' height={60} />
                  <Skeleton variant='rounded' height={60} />
                </Stack>
              ) : (
                <Stack spacing={1.5}>
                  {list?.items.map((item) => (
                    <ConversationItem key={item._id} item={item} />
                  ))}

                  {(!list || list.items.length === 0) && (
                    <Typography
                      color='text.secondary'
                      align='center'
                      sx={{ mt: 2 }}
                    >
                      尚無對話紀錄
                    </Typography>
                  )}

                  {/* 分頁 (放在捲動區底部) */}
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'center',
                      mt: 4,
                      pb: 2,
                    }}
                  >
                    <Pagination
                      count={totalPages}
                      page={page}
                      onChange={(_, p) => setPage(p)}
                      color='primary'
                      shape='rounded'
                      sx={{
                        '& .MuiPaginationItem-root': {
                          color: 'primary.main', // 一般頁碼字體主色
                          borderColor: 'primary.main',
                        },
                        '& .Mui-selected': {
                          backgroundColor: 'primary.main', // 當前頁背景主色
                          color: '#fff', // 當前頁白字
                        },
                        '& .Mui-selected:hover': {
                          backgroundColor: 'primary.dark',
                        },
                      }}
                    />
                  </Box>
                </Stack>
              )}
            </Box>
          </Card>
        </Grid>
        {/* 右側：排行榜 (Top 5 Assistants) */}
        <Grid item size={{ xs: 5 }}>
          <Card variant='outlined' sx={commonCardStyle}>
            {/* 標題區 (使用 CardContent 的 padding 或是自己切 Box 都可以，這裡為了對齊左邊，建議自己切) */}
            <Box sx={{ p: 2, borderBottom: '1px solid #eee' }}>
              <Typography variant='h6' sx={{ fontWeight: 700 }}>
                常用情境對話 Top 5
              </Typography>
            </Box>

            {/* 列表內容區 (可捲動) */}
            <Box sx={scrollableContentStyle}>
              {!overview ? (
                <Skeleton variant='rectangular' height={200} />
              ) : (
                <Stack spacing={2}>
                  {overview.assistantUsage
                    ?.slice(0, 5)
                    .map((assistant, index) => (
                      <Box
                        key={assistant.assistantId}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          p: 1.5,
                          border: '1px solid #eee',
                          borderRadius: 2,
                          transition: '0.2s',
                          '&:hover': { bgcolor: '#f9f9f9' },
                        }}
                      >
                        {/* 排名 */}
                        <Typography
                          variant='h5'
                          sx={{
                            fontWeight: 900,
                            color: index < 3 ? '#ffb400' : '#ccc',
                            width: 40,
                            textAlign: 'center',
                            mr: 1,
                          }}
                        >
                          #{index + 1}
                        </Typography>

                        {/* 名稱與數據 */}
                        <Box>
                          <Typography
                            variant='subtitle2'
                            sx={{ fontWeight: 700 }}
                          >
                            {assistant.name}
                          </Typography>
                          <Stack direction='row' spacing={2}>
                            <Typography
                              variant='caption'
                              color='text.secondary'
                            >
                              💬 {assistant.count} 次對話
                            </Typography>
                          </Stack>
                        </Box>
                      </Box>
                    ))}

                  {overview.assistantUsage?.length === 0 && (
                    <Typography
                      variant='body2'
                      color='text.secondary'
                      align='center'
                      sx={{ mt: 2 }}
                    >
                      目前沒有數據
                    </Typography>
                  )}
                </Stack>
              )}
            </Box>
          </Card>
        </Grid>
        {/* 左側：聊天記錄 (Accordions) */}
      </Grid>
    </Box>
  )
}

// 獨立組件：單個對話條目 (Accordion Style)
// src/pages/Conversations.jsx

function ConversationItem({ item }) {
  // 取得訊息陣列
  const messages = item.messages || []

  // 根據 ID 產生隨機顏色頭像
  const stringToColor = (string) => {
    let hash = 0
    if (!string) return '#bdbdbd'
    for (let i = 0; i < string.length; i += 1)
      hash = string.charCodeAt(i) + ((hash << 5) - hash)
    let color = '#'
    for (let i = 0; i < 3; i += 1)
      color += `00${((hash >> (i * 8)) & 0xff).toString(16)}`.slice(-2)
    return color
  }

  return (
    <Accordion
      disableGutters
      elevation={0}
      sx={{
        border: '1px solid #e0e0e0',
        borderRadius: '12px !important',
        '&:before': { display: 'none' },
        mb: 2,
        overflow: 'hidden',
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        sx={{ bgcolor: '#fff' }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            width: '100%',
            gap: 1.5,
          }}
        >
          {/* Assistant 頭像 */}
          <Avatar
            sx={{
              bgcolor: stringToColor(item.assistantId),
              width: 40,
              height: 40,
              fontWeight: 'bold',
            }}
          >
            {item.assistantName?.[0] || 'A'}
          </Avatar>

          {/* Assistant 名稱與日期 */}
          <Box>
            <Typography variant='subtitle1' sx={{ fontWeight: 700 }}>
              {item.assistantName}
            </Typography>
            <Typography variant='caption' color='text.secondary'>
              {item.updatedAt
                ? new Date(item.updatedAt).toLocaleDateString()
                : ''}
            </Typography>
          </Box>
        </Box>
      </AccordionSummary>

      {/* 對話內容區：展開後顯示 */}
      <AccordionDetails
        sx={{
          bgcolor: '#f8f9fa',
          borderTop: '1px solid #eee',
          p: 2,
          maxHeight: '60vh',
          overflowY: 'auto',
        }}
      >
        {messages.length === 0 ? (
          <Typography
            variant='body2'
            color='text.secondary'
            align='center'
            sx={{ py: 2 }}
          >
            沒有對話內容 (No messages found)
          </Typography>
        ) : (
          <Stack spacing={2}>
            {messages.map((msg, idx) => {
              const isUser = msg.from === 'user'
              const isVoice = msg.isVoice === true
              return (
                <Box
                  key={idx}
                  sx={{
                    display: 'flex',
                    justifyContent: isUser ? 'flex-end' : 'flex-start',
                  }}
                >
                  {/* 對話氣泡 */}
                  <Box
                    sx={{
                      maxWidth: '85%',
                      p: 2,
                      borderRadius: 3,
                      // User: 藍底白字; Assistant: 白底黑字(或淺灰)
                      bgcolor: isUser ? '#62c2b6' : '#ffffff',
                      color: isUser ? '#fff' : '#000',
                      border: isUser ? 'none' : '1px solid #e0e0e0',
                      // 讓氣泡尖角對應發話者位置
                      borderBottomRightRadius: isUser ? 0 : 12,
                      borderTopLeftRadius: !isUser ? 0 : 12,
                      boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      {isUser && isVoice && (
                        <KeyboardVoiceOutlinedIcon
                          sx={{
                            fontSize: 20,
                            color: 'white',
                          }}
                        />
                      )}
                      <Typography
                        variant='body1'
                        sx={{ whiteSpace: 'pre-wrap', fontSize: '0.95rem' }}
                      >
                        {msg.content}
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              )
            })}
          </Stack>
        )}
      </AccordionDetails>
    </Accordion>
  )
}

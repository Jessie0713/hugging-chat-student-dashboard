// src/components/StudentHeader.jsx
import { useEffect, useState } from 'react'
import { NavLink, useParams } from 'react-router-dom'
import {
  AppBar,
  Box,
  Container,
  Toolbar,
  Typography,
  Button,
} from '@mui/material'
import { apiGet } from '../lib/api'
import { colors, radii, type, dinoShadow } from '../theme/tokens'

/**
 * 導覽貼紙：與總覽膠囊／一級按鈕刻意不同
 * - 未選：歪斜虛線票券
 * - 選中：貼上感 + 手繪底線（非綠底白字）
 * - hover：彈跳，不裁切
 */
const NavItem = ({ to, label, tilt = -2 }) => {
  return (
    <Button
      component={NavLink}
      to={to}
      className={({ isActive }) => (isActive ? 'active' : '')}
      disableRipple
      sx={{
        position: 'relative',
        zIndex: 1,
        px: 2,
        py: 1,
        minWidth: 0,
        // 票券感：不對稱圓角
        borderRadius: '14px 18px 12px 16px',
        textTransform: 'none',
        fontWeight: 800,
        fontSize: 14,
        letterSpacing: 0.2,
        color: colors.ink,
        bgcolor: colors.paper,
        border: '2px dashed',
        borderColor: colors.sand,
        boxShadow: `2px 3px 0 ${colors.line}`,
        transform: `rotate(${tilt}deg)`,
        overflow: 'visible',
        transition:
          'transform 0.18s cubic-bezier(.34,1.56,.64,1), background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.18s ease',
        '&:hover': {
          zIndex: 2,
          bgcolor: colors.sageSoft,
          borderColor: colors.leaf,
          color: colors.leafDark,
          boxShadow: `3px 5px 0 ${colors.sand}`,
          transform: `translateY(-4px) rotate(${tilt * -0.5}deg) scale(1.04)`,
        },
        '&.active': {
          zIndex: 2,
          bgcolor: '#f3f7ef',
          color: colors.leafDark,
          borderStyle: 'dashed',
          borderColor: colors.leaf,
          borderWidth: 2.5,
          boxShadow: `3px 4px 0 ${colors.leaf}55`,
          transform: 'translateY(-2px) rotate(0deg) scale(1.03)',
          // 手繪點點底線（不是一級按鈕）
          '&::before': {
            content: '""',
            position: 'absolute',
            left: 12,
            right: 12,
            bottom: 6,
            height: 4,
            backgroundImage: `radial-gradient(circle, ${colors.leaf} 1.4px, transparent 1.5px)`,
            backgroundSize: '7px 4px',
            backgroundRepeat: 'repeat-x',
            backgroundPosition: 'center',
            pointerEvents: 'none',
          },
          // 右上角小角標
          '&::after': {
            content: '""',
            position: 'absolute',
            top: 5,
            right: 7,
            width: 7,
            height: 7,
            borderRadius: '50%',
            bgcolor: colors.leaf,
            boxShadow: `0 0 0 2px ${colors.paper}`,
            pointerEvents: 'none',
          },
          '&:hover': {
            bgcolor: '#eef4e8',
            color: colors.leafDark,
            borderColor: colors.leaf,
            boxShadow: `4px 6px 0 ${colors.leaf}44`,
            transform: 'translateY(-5px) rotate(1deg) scale(1.05)',
          },
        },
      }}
    >
      {label}
    </Button>
  )
}

function DashTrail() {
  return (
    <Box
      aria-hidden
      sx={{
        width: { sm: 18, md: 28 },
        height: 0,
        borderTop: `2px dashed ${colors.sand}`,
        flexShrink: 0,
        display: { xs: 'none', sm: 'block' },
        opacity: 0.85,
      }}
    />
  )
}

export default function StudentHeader() {
  const { source, hfUserId } = useParams()
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled) setProfile(null)
    })
    apiGet(`/api/${source}/student/${hfUserId}/profile`)
      .then((p) => {
        if (!cancelled) setProfile(p)
      })
      .catch(() => {
        if (!cancelled) setProfile(null)
      })
    return () => {
      cancelled = true
    }
  }, [source, hfUserId])

  const displayName =
    profile?.lastname || profile?.firstname
      ? `${profile?.lastname ?? ''}${profile?.firstname ?? ''}您好`
      : `ID ${hfUserId} 您好`

  return (
    <AppBar
      position='sticky'
      elevation={0}
      sx={{
        color: colors.ink,
        borderBottom: 'none',
        background: `linear-gradient(180deg, ${colors.paper} 0%, ${colors.wash} 100%)`,
        boxShadow: 'none',
        overflow: 'visible',
        '&::after': {
          content: '""',
          display: 'block',
          height: 0,
          borderBottom: `3px dashed ${colors.leaf}aa`,
        },
      }}
    >
      <Toolbar
        disableGutters
        sx={{
          minHeight: { xs: 76, sm: 84 },
          overflow: 'visible',
          py: 0.5,
        }}
      >
        <Container
          maxWidth='lg'
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: { xs: 1.5, sm: 2.5 },
            px: { xs: 2, sm: 2 },
            overflow: 'visible',
          }}
        >
          {/* 左側 Logo/品牌 */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.25,
              flexShrink: 0,
            }}
          >
            <Box
              sx={{
                position: 'relative',
                width: { xs: 64, sm: 78 },
                height: { xs: 64, sm: 78 },
                flexShrink: 0,
                overflow: 'visible',
                '@keyframes headerFireBreath': {
                  '0%, 22%, 100%': {
                    opacity: 0,
                    transform: 'scaleX(0.15) scaleY(0.45)',
                  },
                  '3%': {
                    opacity: 1,
                    transform: 'scaleX(0.55) scaleY(0.85)',
                  },
                  '8%': {
                    opacity: 1,
                    transform: 'scaleX(1) scaleY(1.05)',
                  },
                  '14%': {
                    opacity: 0.9,
                    transform: 'scaleX(1.25) scaleY(1)',
                  },
                  '20%': {
                    opacity: 0,
                    transform: 'scaleX(1.45) scaleY(0.6)',
                  },
                },
                '@keyframes headerFireSpark': {
                  '0%, 22%, 100%': {
                    opacity: 0,
                    transform: 'translateX(0) scale(0.4)',
                  },
                  '4%': {
                    opacity: 1,
                    transform: 'translateX(-12px) scale(1)',
                  },
                  '10%': {
                    opacity: 0.85,
                    transform: 'translateX(-36px) scale(0.9)',
                  },
                  '18%': {
                    opacity: 0,
                    transform: 'translateX(-58px) scale(0.35)',
                  },
                },
                '@keyframes headerDinoRoar': {
                  '0%, 22%, 100%': {
                    transform: 'translateY(0) rotate(-2deg)',
                  },
                  '5%': {
                    transform:
                      'translateY(-1px) rotate(-5deg) scale(1.03)',
                  },
                  '10%': {
                    transform:
                      'translateY(-2px) rotate(-3deg) scale(1.05)',
                  },
                  '16%': {
                    transform:
                      'translateY(-1px) rotate(-4deg) scale(1.02)',
                  },
                },
              }}
            >
              <Box
                className='dino-logo'
                component='img'
                src='/dinosaurs/dino-kaiju.png'
                alt=''
                sx={{
                  position: 'relative',
                  zIndex: 1,
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  filter: dinoShadow,
                  animation: 'headerDinoRoar 3s ease-in-out infinite',
                }}
              />

              {/* 火焰錨點：對齊張開的嘴巴，再向左噴出 */}
              <Box
                aria-hidden
                sx={{
                  position: 'absolute',
                  // 嘴巴約在圖左側中上
                  left: { xs: '20%', sm: '22%' },
                  top: { xs: '38%', sm: '40%' },
                  width: 0,
                  height: 0,
                  zIndex: 2,
                  pointerEvents: 'none',
                }}
              >
                <Box
                  sx={{
                    position: 'absolute',
                    right: 0,
                    top: '50%',
                    width: { xs: 72, sm: 92 },
                    height: { xs: 28, sm: 34 },
                    mt: { xs: '-14px', sm: '-17px' },
                    transformOrigin: 'right center',
                    animation: 'headerFireBreath 3s ease-out infinite',
                    background: `
                      radial-gradient(ellipse at 92% 50%, #fff8c0 0%, #fff8c0 18%, transparent 42%),
                      radial-gradient(ellipse at 60% 50%, #ffb347 0%, #ff8a1f 45%, transparent 74%),
                      radial-gradient(ellipse at 22% 50%, #ff5a2a 0%, #e23a1a 50%, transparent 80%)
                    `,
                    filter: 'blur(0.35px)',
                    borderRadius: '48% 8% 8% 48%',
                    '&::before, &::after': {
                      content: '""',
                      position: 'absolute',
                      right: '4%',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      borderRadius: '50%',
                      pointerEvents: 'none',
                    },
                    '&::before': {
                      width: '58%',
                      height: '78%',
                      background:
                        'radial-gradient(ellipse, #ffe566 0%, #ff9a1a 55%, transparent 75%)',
                      filter: 'blur(1.1px)',
                    },
                    '&::after': {
                      width: '38%',
                      height: '60%',
                      right: '30%',
                      background:
                        'radial-gradient(ellipse, #ff7a2e 0%, #d62818 60%, transparent 80%)',
                      filter: 'blur(1.3px)',
                      opacity: 0.95,
                    },
                  }}
                />
                {[0, 1, 2, 3].map((i) => (
                  <Box
                    key={i}
                    sx={{
                      position: 'absolute',
                      right: 2,
                      top: -4 + i * 5,
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      bgcolor: i % 2 === 0 ? '#ff6b2d' : '#ffe566',
                      boxShadow: '0 0 8px #ff8a1f',
                      animation: 'headerFireSpark 3s ease-out infinite',
                      animationDelay: `${i * 0.04}s`,
                    }}
                  />
                ))}
              </Box>
            </Box>
            <Box>
              <Typography
                sx={{
                  ...type.sectionTitle,
                  fontSize: { xs: 14, sm: 16 },
                  letterSpacing: 0.2,
                  lineHeight: 1.15,
                }}
              >
                HuggingChat
              </Typography>
              <Typography
                sx={{
                  ...type.caption,
                  color: colors.leafDark,
                  fontWeight: 700,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  fontSize: 10,
                }}
              >
                Dashboard
              </Typography>
            </Box>
          </Box>

          {/* 中間導覽：票券貼紙列（overflow visible，hover 不裁切） */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: { xs: 0.75, sm: 0.5 },
              py: 1.25,
              px: 0.5,
              overflow: 'visible',
              maxWidth: { xs: '46vw', sm: 'none' },
              // 小螢幕仍可橫滑，但上下留白避免裁切
              '@media (max-width: 600px)': {
                overflowX: 'auto',
                overflowY: 'visible',
                scrollbarWidth: 'none',
                '&::-webkit-scrollbar': { display: 'none' },
              },
            }}
          >
            <NavItem
              to={`/${source}/student/${hfUserId}/overview`}
              label='總覽'
              tilt={-2.5}
            />
            <DashTrail />
            <NavItem
              to={`/${source}/student/${hfUserId}/conversations`}
              label='對話分析'
              tilt={1.8}
            />
            <DashTrail />
            <NavItem
              to={`/${source}/student/${hfUserId}/practice-next`}
              label='練習建議'
              tilt={-1.2}
            />
          </Box>

          <Box sx={{ flex: 1 }} />

          {/* 右側問候：次級按鈕 sand 邊 */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 1.5,
              py: 0.75,
              borderRadius: `${radii.btn}px`,
              bgcolor: 'transparent',
              border: '2px solid',
              borderColor: colors.sand,
              maxWidth: { xs: 140, sm: 260 },
            }}
          >
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: colors.leaf,
                flexShrink: 0,
                '@keyframes headerPulse': {
                  '0%, 100%': { opacity: 1, transform: 'scale(1)' },
                  '50%': { opacity: 0.55, transform: 'scale(0.85)' },
                },
                animation: 'headerPulse 2s ease-in-out infinite',
              }}
            />
            <Typography
              sx={{
                fontWeight: 800,
                fontSize: { xs: 12, sm: 14 },
                color: colors.ink,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {displayName}
            </Typography>
          </Box>
        </Container>
      </Toolbar>
    </AppBar>
  )
}

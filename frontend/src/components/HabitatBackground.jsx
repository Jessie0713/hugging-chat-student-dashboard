import { Box } from '@mui/material'
import { colors } from '../theme/tokens'

const HABITAT_SRC = '/dinosaurs/dino-run-ground.jpg'

/**
 * 全畫面恐龍棲地背景（固定在儀表板後方，不攔截點擊、不蓋住內容）。
 */
export default function HabitatBackground() {
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
        src={HABITAT_SRC}
        alt=''
        sx={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center 55%',
          display: 'block',
          userSelect: 'none',
        }}
      />
      {/* 洗白遮罩：保留棲地氛圍，讓卡片／文字仍清楚可讀 */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          background: `
            linear-gradient(
              180deg,
              ${colors.wash}bf 0%,
              ${colors.wash}ab 38%,
              ${colors.wash}c4 100%
            )
          `,
        }}
      />
    </Box>
  )
}

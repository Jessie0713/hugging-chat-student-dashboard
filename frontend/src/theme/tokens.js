/**
 * 全站設計系統 tokens（依練習建議頁規格）
 * 顏色／字級／按鈕請由此匯出，避免各頁硬編碼。
 */

export const colors = {
  /** 主色：選取、主按鈕、進度完成 */
  leaf: '#6f8f5e',
  leafHover: '#638552',
  leafDark: '#5a7549',
  /** 次強調／未選標籤 */
  sage: '#8a9a7b',
  sageSoft: '#eef1e8',
  /** 文字 */
  ink: '#4a453f',
  muted: '#7a736a',
  /** 線／底 */
  line: '#e4ddd3',
  sand: '#c4b49a',
  wash: '#f4efe6',
  paper: '#fffcf7',
  white: '#ffffff',
  /** 裝飾（主題頁可用，勿當主 CTA） */
  sky: '#d9e6ef',
  amber: '#d4a574',
  wood: '#b8956c',
  woodDark: '#8f6f4a',
  grass: '#9bb584',
  ticket: '#f3e0b8',
  /** 語意色 */
  error: '#CC4A44',
  errorLight: '#db807c',
  notice: '#f4857f',
  gray: '#f2f2f2',
  grayDark: '#666666',
}

/** 圓角（單位 px；請用 `${radii.lg}px`，勿再用 MUI 倍乘數避免不一致） */
export const radii = {
  /** Chip／小標籤 */
  sm: 18,
  /** 輸入框／一般小元件 */
  md: 8,
  /** 主／次按鈕 */
  btn: 18,
  /** 卡片／面板（與總覽卡片一致） */
  lg: 20,
  /** 頁首大區塊（與卡片同規，視覺統一） */
  xl: 20,
}

/** 與舊 PracticeNextPage `tone` 相容的別名 */
export const tone = {
  ink: colors.ink,
  muted: colors.muted,
  line: colors.line,
  paper: colors.paper,
  wash: colors.wash,
  sage: colors.sage,
  sageSoft: colors.sageSoft,
  sand: colors.sand,
  leaf: colors.leaf,
  sky: colors.sky,
  amber: colors.amber,
  wood: colors.wood,
  woodDark: colors.woodDark,
  grass: colors.grass,
  ticket: colors.ticket,
}

/** 字級層級（可直接展開進 Typography sx） */
export const type = {
  pageTitle: {
    fontWeight: 800,
    fontSize: { xs: 18, sm: 20 },
    color: colors.ink,
    lineHeight: 1.3,
  },
  sectionTitle: {
    fontWeight: 800,
    fontSize: { xs: 15, sm: 16 },
    color: colors.ink,
    lineHeight: 1.35,
  },
  subsection: {
    fontWeight: 800,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 1.4,
  },
  subtitle: {
    fontWeight: 400,
    fontSize: 14,
    color: colors.muted,
    lineHeight: 1.5,
  },
  body: {
    fontWeight: 400,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 1.5,
  },
  bodyMuted: {
    fontWeight: 400,
    fontSize: 14,
    color: colors.muted,
    lineHeight: 1.5,
  },
  label: {
    fontWeight: 800,
    fontSize: 12,
    color: colors.muted,
    lineHeight: 1.4,
  },
  caption: {
    fontWeight: 400,
    fontSize: 12,
    color: colors.muted,
    lineHeight: 1.4,
  },
  badge: {
    fontWeight: 800,
    fontSize: 11,
    lineHeight: 1.2,
  },
  button: {
    fontWeight: 800,
    fontSize: 14,
    textTransform: 'none',
  },
}

/** Primary：綠底白字、立體按壓 */
export const buttonPrimarySx = {
  ...type.button,
  borderRadius: `${radii.btn}px`,
  px: 3,
  py: 1.1,
  color: colors.white,
  bgcolor: colors.leaf,
  boxShadow: `0 6px 0 ${colors.leafDark}`,
  transition: 'transform 0.12s ease, box-shadow 0.12s ease, background-color 0.12s ease',
  '&:hover': {
    bgcolor: colors.leafHover,
    boxShadow: `0 6px 0 ${colors.leafDark}`,
    transform: 'translateY(-2px)',
  },
  '&:active': {
    transform: 'translateY(3px)',
    boxShadow: `0 2px 0 ${colors.leafDark}`,
  },
  '&.Mui-disabled': {
    bgcolor: colors.line,
    color: colors.muted,
    boxShadow: 'none',
  },
}

/** Secondary：線框、Ink 字（返回／次要動作） */
export const buttonSecondarySx = {
  ...type.button,
  borderRadius: `${radii.btn}px`,
  px: 2.5,
  py: 1,
  color: colors.ink,
  bgcolor: 'transparent',
  border: '2px solid',
  borderColor: colors.sand,
  boxShadow: 'none',
  transition: 'transform 0.12s ease, background-color 0.12s ease, border-color 0.12s ease',
  '&:hover': {
    borderColor: colors.leaf,
    bgcolor: colors.sageSoft,
    color: colors.ink,
    transform: 'translateY(-2px)',
  },
  '&:active': {
    transform: 'translateY(1px)',
  },
  '&.Mui-disabled': {
    borderColor: colors.line,
    color: colors.muted,
    bgcolor: 'transparent',
  },
}

/**
 * Accordion 卡片圓角（展開時 MUI 會清掉底部圓角，需 !important）
 */
export const accordionCardSx = {
  borderRadius: `${radii.btn}px !important`,
  overflow: 'hidden',
  boxShadow: 'none',
  '&:before': { display: 'none' },
  '&.Mui-expanded': {
    margin: '0 !important',
    borderRadius: `${radii.btn}px !important`,
  },
  '&:first-of-type': {
    borderTopLeftRadius: `${radii.btn}px !important`,
    borderTopRightRadius: `${radii.btn}px !important`,
  },
  '&:last-of-type': {
    borderBottomLeftRadius: `${radii.btn}px !important`,
    borderBottomRightRadius: `${radii.btn}px !important`,
  },
  '& .MuiAccordionSummary-root': {
    borderRadius: `${radii.btn}px`,
    '&.Mui-expanded': {
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
    },
  },
  '& .MuiAccordionDetails-root': {
    borderBottomLeftRadius: `${radii.btn}px`,
    borderBottomRightRadius: `${radii.btn}px`,
  },
}

/** CSS 變數字串（掛在 :root） */
export const cssVariables = {
  '--color-leaf': colors.leaf,
  '--color-leaf-hover': colors.leafHover,
  '--color-leaf-dark': colors.leafDark,
  '--color-sage': colors.sage,
  '--color-sage-soft': colors.sageSoft,
  '--color-ink': colors.ink,
  '--color-muted': colors.muted,
  '--color-line': colors.line,
  '--color-sand': colors.sand,
  '--color-wash': colors.wash,
  '--color-paper': colors.paper,
  '--color-white': colors.white,
  '--color-sky': colors.sky,
  '--color-amber': colors.amber,
  '--color-error': colors.error,
  '--radius-sm': `${radii.sm}px`,
  '--radius-md': `${radii.md}px`,
  '--radius-btn': `${radii.btn}px`,
  '--radius-lg': `${radii.lg}px`,
  '--radius-xl': `${radii.xl}px`,
}

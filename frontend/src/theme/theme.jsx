import { createTheme } from '@mui/material'

const theme = createTheme({
  // 1. Palette: 保留你的顏色定義，加入他們的背景色
  palette: {
    primary: {
      main: '#54a9c0',
      b: '#bfe1ea',
      c: '#e6faff',
    },
    secondary: {
      main: '#62c2b6',
      b: '#d3f0ec',
    },
    notice: {
      main: '#f4857f',
      c: '#e6faff',
    },
    success: {
      main: '#68C6C8',
    },
    error: {
      light: '#db807c',
      main: '#CC4A44',
    },
    // 注意：MUI 預設是用 'grey' (英式拼寫)，你的 'gray' 是自定義擴充，保留不動以免報錯
    gray: {
      main: '#f2f2f2',
      d: '#666',
    },
    // [新增] 這是為了跟對方背景一致 (來自 tailwind.config.js customBg)
    background: {
      default: '#f8f8f8',
      paper: '#ffffff',
    },
  },

  // 2. Typography: 保留你的大小(h1-h6)設定，融入他們的字體(FontFamily)
  typography: {
    // [新增] 統一字體，讓質感跟對方一致 (來自 index.css)
    fontFamily: [
      'system-ui',
      '"Microsoft JhengHei"',
      '"PingFang TC"',
      'Arial',
      'sans-serif',
    ].join(','),

    // [保留] 你原本定義的大小與粗細
    h1: {
      fontSize: '30px',
      fontWeight: 'bold',
    },
    h2: {
      fontSize: '28px',
      fontWeight: 'bold',
    },
    h3: {
      fontSize: '18px',
      fontWeight: 'bolder',
    },
    h4: {
      fontSize: '16px',
    },
    h5: {
      fontSize: '14px',
    },
    h6: {
      fontSize: '12px',
    },
    button: {
      textTransform: 'none',
    },
  },

  // 3. Components: 混合樣式
  components: {
    // [新增] 這會確保整個網頁背景色變成他們的淺灰色 (#f8f8f8)
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: '#f8f8f8',
        },
      },
    },
    MuiTypography: {
      styleOverrides: {
        root: {
          letterSpacing: '0.02rem', // [保留] 你的設定
        },
      },
    },
    MuiCardHeader: {
      styleOverrides: {
        root: {
          margin: '0px',
          padding: '0px', // [保留] 你的設定
        },
      },
    },
    MuiCardContent: {
      styleOverrides: {
        root: {
          margin: '0px',
          padding: '5px', // [保留] 你的設定
          '&:last-child': {
            paddingBottom: 0,
          },
          overflow: 'unset',
        },
      },
    },
    // [重點] Card 樣式融合：保留你的 Layout (Padding)，改用他們的 Visual (Shadow/Border)
    MuiCard: {
      defaultProps: {
        elevation: 0, // [保留]
      },
      styleOverrides: {
        root: {
          // [修改] 為了像 Tailwind，改用 Shadow 模擬邊框，而不是實體 border
          // 原本: border: '1px solid #ccc',
          border: 'none',
          boxShadow: '0 0 0 1px #f3f4f6, 0 8px 16px rgba(0,0,0,0.08)', // 對方的樣式

          // [修改] 對方的圓角比較大 (1rem = 16px)，建議改過來，視覺比較統一
          // 原本: borderRadius: '10px',
          borderRadius: '16px',

          // [保留] 你的 Padding 設定
          padding: '15px',
          margin: '0px',
        },
      },
    },
    MuiFormLabel: {
      styleOverrides: {
        asterisk: {
          color: '#d32f2f', // [保留] 你的設定
        },
      },
    },
  },
})

export default theme

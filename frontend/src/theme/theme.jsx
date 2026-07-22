import { createTheme } from '@mui/material'
import { colors, cssVariables, type, radii, accordionCardSx } from './tokens'

const theme = createTheme({
  palette: {
    primary: {
      main: colors.leaf,
      light: colors.sageSoft,
      dark: colors.leafDark,
      contrastText: colors.white,
      // 相容舊程式用 primary.b / primary.c
      b: colors.sageSoft,
      c: colors.wash,
    },
    secondary: {
      main: colors.sage,
      light: colors.sageSoft,
      dark: colors.leafDark,
      contrastText: colors.white,
      b: colors.sageSoft,
    },
    notice: {
      main: colors.notice,
      c: colors.wash,
    },
    success: {
      main: colors.leaf,
      light: colors.sageSoft,
      dark: colors.leafDark,
    },
    error: {
      light: colors.errorLight,
      main: colors.error,
    },
    gray: {
      main: colors.gray,
      d: colors.grayDark,
    },
    text: {
      primary: colors.ink,
      secondary: colors.muted,
    },
    divider: colors.line,
    background: {
      default: colors.wash,
      paper: colors.paper,
    },
  },

  typography: {
    fontFamily: [
      'system-ui',
      '"Microsoft JhengHei"',
      '"PingFang TC"',
      'Arial',
      'sans-serif',
    ].join(','),
    h1: {
      fontSize: '30px',
      fontWeight: 800,
      color: colors.ink,
    },
    h2: {
      fontSize: '28px',
      fontWeight: 800,
      color: colors.ink,
    },
    h3: {
      fontSize: '20px',
      fontWeight: 800,
      color: colors.ink,
      lineHeight: 1.3,
    },
    h4: {
      fontSize: '16px',
      fontWeight: 800,
      color: colors.ink,
    },
    h5: {
      fontSize: '14px',
      fontWeight: 800,
      color: colors.ink,
    },
    h6: {
      fontSize: '16px',
      fontWeight: 800,
      color: colors.ink,
      lineHeight: 1.35,
    },
    subtitle1: {
      fontSize: '14px',
      fontWeight: 800,
      color: colors.ink,
      lineHeight: 1.4,
    },
    subtitle2: {
      fontSize: '14px',
      fontWeight: 800,
      color: colors.ink,
      lineHeight: 1.4,
    },
    body1: {
      fontSize: '14px',
      fontWeight: 400,
      color: colors.ink,
      lineHeight: 1.5,
    },
    body2: {
      fontSize: '14px',
      fontWeight: 400,
      color: colors.muted,
      lineHeight: 1.5,
    },
    caption: {
      fontSize: '12px',
      fontWeight: 400,
      color: colors.muted,
      lineHeight: 1.4,
    },
    button: {
      ...type.button,
    },
  },

  shape: {
    borderRadius: radii.md,
  },

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        ':root': cssVariables,
        body: {
          backgroundColor: colors.wash,
          color: colors.ink,
        },
      },
    },
    MuiTypography: {
      styleOverrides: {
        root: {
          letterSpacing: '0.02rem',
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 800,
          borderRadius: `${radii.btn}px`,
        },
        contained: {
          color: colors.white,
          backgroundColor: colors.leaf,
          boxShadow: `0 6px 0 ${colors.leafDark}`,
          paddingLeft: 24,
          paddingRight: 24,
          paddingTop: 8,
          paddingBottom: 8,
          borderRadius: `${radii.btn}px`,
          '&:hover': {
            backgroundColor: colors.leafHover,
            boxShadow: `0 6px 0 ${colors.leafDark}`,
          },
          '&:active': {
            transform: 'translateY(2px)',
            boxShadow: `0 2px 0 ${colors.leafDark}`,
          },
          '&.Mui-disabled': {
            backgroundColor: colors.line,
            color: colors.muted,
            boxShadow: 'none',
          },
        },
        containedPrimary: {
          backgroundColor: colors.leaf,
          '&:hover': {
            backgroundColor: colors.leafHover,
          },
        },
        outlined: {
          color: colors.ink,
          borderWidth: 2,
          borderColor: colors.sand,
          backgroundColor: 'transparent',
          paddingLeft: 20,
          paddingRight: 20,
          paddingTop: 7,
          paddingBottom: 7,
          borderRadius: `${radii.btn}px`,
          '&:hover': {
            borderWidth: 2,
            borderColor: colors.leaf,
            backgroundColor: colors.sageSoft,
          },
          '&.Mui-disabled': {
            borderColor: colors.line,
            color: colors.muted,
          },
        },
        outlinedPrimary: {
          color: colors.ink,
          borderColor: colors.sand,
          '&:hover': {
            borderColor: colors.leaf,
            backgroundColor: colors.sageSoft,
          },
        },
        text: {
          color: colors.ink,
          fontWeight: 700,
          borderRadius: 0,
          '&:hover': {
            backgroundColor: 'transparent',
            color: colors.leaf,
          },
        },
      },
    },
    MuiCardHeader: {
      styleOverrides: {
        root: {
          margin: '0px',
          padding: '0px',
        },
      },
    },
    MuiCardContent: {
      styleOverrides: {
        root: {
          margin: '0px',
          padding: '5px',
          '&:last-child': {
            paddingBottom: 0,
          },
          overflow: 'unset',
        },
      },
    },
    MuiCard: {
      defaultProps: {
        elevation: 0,
      },
      styleOverrides: {
        root: {
          border: `1px solid ${colors.line}`,
          boxShadow: 'none',
          borderRadius: `${radii.lg}px`,
          backgroundColor: colors.paper,
          padding: '15px',
          margin: '0px',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 700,
          borderRadius: `${radii.sm}px`,
        },
        outlined: {
          borderColor: colors.line,
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: colors.paper,
          color: colors.ink,
          borderBottom: `1px solid ${colors.line}`,
          boxShadow: 'none',
        },
      },
    },
    MuiFormLabel: {
      styleOverrides: {
        asterisk: {
          color: colors.error,
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          backgroundColor: colors.wash,
          borderRadius: `${radii.sm}px`,
        },
        bar: {
          backgroundColor: colors.leaf,
          borderRadius: `${radii.sm}px`,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        rounded: {
          borderRadius: `${radii.lg}px`,
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: `${radii.md}px`,
        },
      },
    },
    MuiAccordion: {
      defaultProps: {
        disableGutters: true,
        elevation: 0,
      },
      styleOverrides: {
        root: {
          ...accordionCardSx,
        },
      },
    },
    MuiCircularProgress: {
      styleOverrides: {
        root: {
          color: colors.leaf,
        },
      },
    },
    MuiCheckbox: {
      styleOverrides: {
        root: {
          color: colors.muted,
          '&.Mui-checked': {
            color: colors.leaf,
          },
        },
      },
    },
  },
})

export default theme

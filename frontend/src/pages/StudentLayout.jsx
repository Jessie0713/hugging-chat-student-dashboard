// src/pages/StudentLayout.jsx
import { Outlet } from 'react-router-dom'
import { Container, Box } from '@mui/material'
import Header from '../components/Header'

export default function StudentLayout() {
  return (
    <Box>
      <Header />
      <Container maxWidth='lg' sx={{ py: 3 }}>
        <Outlet />
      </Container>
    </Box>
  )
}

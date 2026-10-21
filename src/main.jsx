import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import SplatvBenchmark from './SplatvBenchmark.jsx'

const isSplatvBenchmark = new URLSearchParams(window.location.search).get('embed') === 'splatv';

createRoot(document.getElementById('root')).render(
  isSplatvBenchmark
    ? <SplatvBenchmark />
    : <StrictMode><App /></StrictMode>,
)

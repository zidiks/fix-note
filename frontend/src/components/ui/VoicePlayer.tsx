import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useTelegram } from '../../hooks/useTelegram'

interface VoicePlayerProps {
  voiceUrl: string
  duration: number // in seconds
  className?: string
}

export const VoicePlayer = ({ voiceUrl, duration, className }: VoicePlayerProps) => {
  const { hapticImpact } = useTelegram()
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${String(secs).padStart(2, '0')}`
  }

  // Generate waveform bars (simplified visualization)
  const generateWaveform = () => {
    const bars = 50
    const heights: number[] = []
    for (let i = 0; i < bars; i++) {
      // Random heights for visualization, with some variation
      const baseHeight = 20 + Math.random() * 40
      heights.push(baseHeight)
    }
    return heights
  }

  const [waveformHeights] = useState(() => generateWaveform())

  useEffect(() => {
    // Create new audio element when voiceUrl changes
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
    }
    
    audioRef.current = new Audio(voiceUrl)
    audioRef.current.preload = 'metadata'
    
    const audio = audioRef.current

    const updateTime = () => {
      setCurrentTime(audio.currentTime)
    }

    const handleEnded = () => {
      setIsPlaying(false)
      setCurrentTime(0)
      audio.currentTime = 0
    }

    const handleLoadedMetadata = () => {
      setIsLoading(false)
    }

    const handleLoadStart = () => {
      setIsLoading(true)
    }

    const handleError = () => {
      setIsLoading(false)
      setIsPlaying(false)
      console.error('Error loading audio')
    }

    audio.addEventListener('timeupdate', updateTime)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('loadstart', handleLoadStart)
    audio.addEventListener('error', handleError)

    return () => {
      if (audio) {
        audio.removeEventListener('timeupdate', updateTime)
        audio.removeEventListener('ended', handleEnded)
        audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
        audio.removeEventListener('loadstart', handleLoadStart)
        audio.removeEventListener('error', handleError)
        audio.pause()
        audio.src = ''
      }
    }
  }, [voiceUrl])

  useEffect(() => {
    if (!audioRef.current) return

    if (isPlaying) {
      audioRef.current.play().catch((error) => {
        console.error('Error playing audio:', error)
        setIsPlaying(false)
      })
    } else {
      audioRef.current.pause()
    }
  }, [isPlaying])

  const togglePlay = () => {
    hapticImpact('light')
    setIsPlaying(!isPlaying)
  }

  // Calculate progress for waveform animation
  const progress = duration > 0 ? currentTime / duration : 0
  const activeBars = Math.floor(progress * waveformHeights.length)

  return (
    <div className={`mb-6 ${className || ''}`}>
      <div className="flex items-center gap-3 px-4 py-3 bg-[#F2F2F7] rounded-full">
        {/* Timestamp */}
        <span className="text-sm font-medium text-[#8E8E93] min-w-[2.5rem] text-right">
          {formatTime(currentTime)}
        </span>

        {/* Waveform */}
        <div className="flex-1 flex items-center gap-0.5 h-8 px-2">
          {waveformHeights.map((height, index) => {
            const isActive = index < activeBars
            const barHeight = isActive ? height : height * 0.4
            
            return (
              <motion.div
                key={index}
                className="w-0.5 bg-[#8E8E93] rounded-full"
                style={{
                  height: `${barHeight}%`,
                  minHeight: '2px',
                }}
                animate={{
                  height: isActive ? `${height}%` : `${height * 0.4}%`,
                  opacity: isActive ? 1 : 0.5,
                }}
                transition={{
                  duration: 0.2,
                  ease: 'easeOut',
                }}
              />
            )
          })}
        </div>

        {/* Play/Pause Button */}
        <button
          onClick={togglePlay}
          disabled={isLoading}
          className="flex-shrink-0 w-10 h-10 rounded-full bg-[#007AFF] flex items-center justify-center text-white transition-opacity disabled:opacity-50"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isLoading ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : isPlaying ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}


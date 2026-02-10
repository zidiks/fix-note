import { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  onClick?: () => void
}

export const Card = ({ children, className = '', onClick }: CardProps) => {
  return (
    <div
      className={`bg-[var(--bg-secondary)] rounded-ios shadow-ios transition-colors ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  )
}







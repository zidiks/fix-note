interface BadgeProps {
  children: React.ReactNode
  variant?: 'voice' | 'text' | 'photo' | 'default'
  className?: string
}

const variantClasses = {
  voice: 'bg-[rgba(0,122,255,0.1)] text-[var(--accent)] dark:bg-[rgba(0,122,255,0.2)]',
  text: 'bg-[rgba(52,199,89,0.1)] text-[var(--success)] dark:bg-[rgba(52,199,89,0.2)]',
  photo: 'bg-[rgba(255,149,0,0.1)] text-[var(--warning)] dark:bg-[rgba(255,149,0,0.2)]',
  default: 'bg-[var(--bg-secondary)] text-[var(--text-primary)]'
}

export const Badge = ({ children, variant = 'default', className = '' }: BadgeProps) => {
  return (
    <span 
      className={`inline-flex items-center justify-center px-2 py-0.5 rounded-[10px] text-xs font-medium ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  )
}







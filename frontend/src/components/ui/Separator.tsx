interface SeparatorProps {
  className?: string
}

export const Separator = ({ className = '' }: SeparatorProps) => {
  return (
    <div 
      className={`h-[0.5px] bg-[var(--separator)] ${className}`}
    />
  )
}







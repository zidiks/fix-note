interface EmptyStateProps {
  icon: string
  title: string
  description?: string
}

export const EmptyState = ({ icon, title, description }: EmptyStateProps) => {
  return (
    <div className="flex flex-col items-center justify-center pt-20 px-4">
      <div className="text-5xl mb-4">{icon}</div>
      <h3 className="text-lg font-semibold mb-1 text-[var(--text-primary)]">
        {title}
      </h3>
      {description && (
        <p className="text-center text-[var(--text-secondary)]">
          {description}
        </p>
      )}
    </div>
  )
}







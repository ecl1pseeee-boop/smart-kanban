import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode
  trailing?: ReactNode
  wrapClassName?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { icon, trailing, className, wrapClassName, ...rest },
  ref,
) {
  return (
    <span className={cn('pb-input-wrap', wrapClassName)}>
      {icon && <span className="pb-input-icon">{icon}</span>}
      <input
        ref={ref}
        className={cn('pb-input', className)}
        data-has-icon={icon ? 'true' : undefined}
        data-has-trailing={trailing ? 'true' : undefined}
        {...rest}
      />
      {trailing && <span className="pb-input-trailing">{trailing}</span>}
    </span>
  )
})

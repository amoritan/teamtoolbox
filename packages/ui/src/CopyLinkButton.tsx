import { Check, Link } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, type ButtonProps } from './Button'

export interface CopyLinkButtonProps extends Omit<ButtonProps, 'onClick' | 'children'> {
  link: string
  label?: string
}

/** Copies a room link. Says "Copied" for two seconds instead of showing a toast (§5.2). */
export function CopyLinkButton({ link, label = 'Copy link', ...props }: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  return (
    <Button
      {...props}
      onClick={async () => {
        await navigator.clipboard.writeText(link)
        setCopied(true)
      }}
    >
      {copied ? <Check className="size-4" /> : <Link className="size-4" />}
      <span aria-live="polite">{copied ? 'Copied' : label}</span>
    </Button>
  )
}

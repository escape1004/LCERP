import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { Copy } from "lucide-react"
import React from "react"

export function Toaster() {
  const { toasts } = useToast()
  const [copied, setCopied] = React.useState(false)

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch (e) {
      setCopied(false)
    }
  }

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <div className="flex items-center gap-2">
                  <ToastDescription>{description}</ToastDescription>
                  {typeof description === 'string' && (
                    <>
                      <button
                        className="p-1 rounded hover:bg-gray-200/20 transition"
                        title="메시지 복사"
                        onClick={() => handleCopy(description)}
                      >
                        <Copy size={16} />
                      </button>
                      {copied && <span className="text-xs text-green-400 ml-1">복사됨!</span>}
                    </>
                  )}
                </div>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}

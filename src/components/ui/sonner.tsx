import { useTheme } from "next-themes"
import { Toaster as Sonner, toast } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:rounded-xl group-[.toaster]:border group-[.toaster]:border-[#202225] group-[.toaster]:bg-[#2b2d31] group-[.toaster]:px-4 group-[.toaster]:py-3 group-[.toaster]:text-[#dcddde] group-[.toaster]:shadow-[0_18px_40px_rgba(0,0,0,0.45)]",
          title: "group-[.toast]:text-[13px] group-[.toast]:font-semibold group-[.toast]:leading-5 group-[.toast]:tracking-[0.01em]",
          description: "group-[.toast]:text-xs group-[.toast]:leading-5 group-[.toast]:text-[#b5bac1]",
          actionButton:
            "group-[.toast]:border group-[.toast]:border-[#4f545c] group-[.toast]:bg-[#3a3d44] group-[.toast]:text-[#dcddde] group-[.toast]:hover:bg-[#4a4f58]",
          cancelButton:
            "group-[.toast]:border group-[.toast]:border-[#4f545c] group-[.toast]:bg-[#202225] group-[.toast]:text-[#b5bac1] group-[.toast]:hover:bg-[#40444b] group-[.toast]:hover:text-white",
          success:
            "group-[.toaster]:border-[#202225] group-[.toaster]:bg-[#2b2d31] group-[.toaster]:text-[#dcddde]",
          error:
            "group-[.toaster]:border-[#592326] group-[.toaster]:bg-[#3a2225] group-[.toaster]:text-[#ffe5e7]",
          warning:
            "group-[.toaster]:border-[#6b531b] group-[.toaster]:bg-[#3a311d] group-[.toaster]:text-[#fff3d1]",
          info:
            "group-[.toaster]:border-[#2f3b63] group-[.toaster]:bg-[#232936] group-[.toaster]:text-[#d7defe]",
        },
      }}
      {...props}
    />
  )
}

export { Toaster, toast }

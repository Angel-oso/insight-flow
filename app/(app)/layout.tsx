import { AppNavigation } from "@/components/app-navigation"

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <AppNavigation />
      <main className="flex flex-1 flex-col p-4 md:p-6">{children}</main>
    </>
  )
}

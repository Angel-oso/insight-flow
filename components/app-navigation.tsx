"use client"

import * as React from "react"
import {
  AudioWaveform,
  Command,
  GalleryVerticalEnd,
} from "lucide-react"

import { NavUser } from "@/components/nav-user"
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu"

const teams = [
  { name: "Acme Inc", logo: GalleryVerticalEnd, plan: "Enterprise" },
  { name: "Acme Corp.", logo: AudioWaveform, plan: "Startup" },
  { name: "Evil Corp.", logo: Command, plan: "Free" },
]

const categories = [
  {
    title: "Explorar",
    items: ["Resumen", "Actividad reciente", "Favoritos"],
  },
  {
    title: "Análisis",
    items: ["Informes", "Métricas", "Tendencias"],
  },
  {
    title: "Recursos",
    items: ["Documentación", "Plantillas", "Ayuda"],
  },
]

const user = {
  name: "shadcn",
  email: "m@example.com",
  avatar: "/avatars/shadcn.jpg",
}

export function AppNavigation() {
  const [activeTeamIndex, setActiveTeamIndex] = React.useState(0)

  return (
    <header className="flex h-16 w-full items-center gap-3 border-b px-4 md:px-6">      
      <NavigationMenu className="min-w-0 max-w-none justify-self-center overflow-x-auto">
        <NavigationMenuList className="w-max">
          {categories.map((category) => (
            <NavigationMenuItem key={category.title}>
              <NavigationMenuTrigger>{category.title}</NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="grid w-52 gap-1 p-1">
                  {category.items.map((item) => (
                    <li key={item}>
                      <NavigationMenuLink href="#">{item}</NavigationMenuLink>
                    </li>
                  ))}
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>
          ))}
        </NavigationMenuList>
      </NavigationMenu>

      <NavUser
        user={user}
        teams={teams}
        activeTeamIndex={activeTeamIndex}        
      />
    </header>
  )
}

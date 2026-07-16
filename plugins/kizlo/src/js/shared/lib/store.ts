import { atom } from "nanostores"
import type { Settings } from "./schema"

export const $sidebar = atom<boolean>(false)

export const $search = atom<boolean>(false)

export const $settings = atom<Settings | null>((window as any).kizlo ?? null)

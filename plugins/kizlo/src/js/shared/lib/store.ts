// import { persistentMap } from "@nanostores/persistent"
import { atom } from "nanostores"
import type { Settings } from "./schema"

export const $sidebar = atom<boolean>(false)

export const $search = atom<boolean>(false)

export const $settings = atom<Settings | null>((window as any).kizlo ?? null)

// export const $preference = persistentMap<{}>("kizlo-preferences", {}, { encode: JSON.stringify, decode: JSON.parse })

import { createContext, useContext } from 'react'
export const Ctx = createContext()
export const useT = () => useContext(Ctx)

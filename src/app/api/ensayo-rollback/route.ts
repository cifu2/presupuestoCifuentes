import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Ruta temporal del ensayo real de rollback de CIF-25: simula en produccion un
// release roto (endpoint que responde 500) para poder promover el deployment
// anterior y comprobar la recuperacion. Se revierte con `git revert` en el PR
// inmediatamente posterior y no forma parte del MVP.
export function GET(): NextResponse {
  return NextResponse.json({ status: 'fallo-simulado', ensayo: 'CIF-25' }, { status: 500 })
}

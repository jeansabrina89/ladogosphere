import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/inscription') ||
    pathname.startsWith('/reset-password') ||
    // Désinscription : accessible depuis un e-mail, donc sans session.
    pathname.startsWith('/desinscription') ||
    // Retrait d'une alerte de retour en stock : même raison, même porte.
    pathname.startsWith('/alerte-stock') ||
    // Le catalogue en ligne se parcourt sans compte : liste, fiche produit et
    // panier. La CONNEXION reste exigée pour valider — c'est la page du panier
    // qui la demande, au moment de commander, et pas avant.
    //
    // Rien d'autre ne s'ouvre : tout /mon-compte reste derrière la session.
    pathname === '/catalogue' ||
    pathname.startsWith('/catalogue/') ||
    pathname.startsWith('/auth/confirm') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response = NextResponse.next({ request })
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

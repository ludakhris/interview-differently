import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { ConfirmProvider } from '@/components/ConfirmDialog'
import type { AppliedBrand } from '@/lib/brand'

const BrandContext = createContext<AppliedBrand | null>(null)

/**
 * Applies a validated brand to the LTI play screens: the `--ld-*` variables are set on this one
 * wrapper (`display: contents`, so layout is untouched) and never on :root, so nothing outside
 * the LTI route can see them. `data-lti-brand` names the scheme when the brand sets colours
 * ("default" otherwise); index.css uses it to keep `.sim-dark` panels in the tenant's colours.
 */
export function LtiBrandProvider({
  brand,
  children,
}: {
  brand: AppliedBrand
  children: ReactNode
}) {
  useBrandFont(brand.font)
  return (
    <BrandContext.Provider value={brand}>
      <div
        className="contents"
        data-lti-brand={Object.keys(brand.cssVars).length > 0 ? brand.scheme : 'default'}
        data-lti-font={brand.font ?? undefined}
        style={brand.cssVars}
      >
        {/* its own confirm dialog, inside the brand scope, so it wears the tenant's look */}
        <ConfirmProvider>{children}</ConfirmProvider>
      </div>
    </BrandContext.Provider>
  )
}

/**
 * Loads the brand's typeface from Google Fonts (allowed by the CSP). `font` is one of BRAND_FONTS,
 * already validated, so the URL is built only from a known family name.
 */
function useBrandFont(font: string | null) {
  useEffect(() => {
    if (!font) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:wght@400;500;600;700;800&display=swap`
    document.head.appendChild(link)
    return () => link.remove()
  }, [font])
}

/** The applied brand inside an LTI route; null everywhere else. */
export function useLtiBrand(): AppliedBrand | null {
  return useContext(BrandContext)
}

import { createContext, useContext, type ReactNode } from 'react'
import { ConfirmProvider } from '@/components/ConfirmDialog'
import type { AppliedBrand } from '@/lib/brand'

const BrandContext = createContext<AppliedBrand | null>(null)

/**
 * Applies a validated brand to the LTI play screens: the `--ld-*` variables are set on this one
 * wrapper (`display: contents`, so layout is untouched) and never on :root, so nothing outside
 * the LTI route can see them.
 */
export function LtiBrandProvider({
  brand,
  children,
}: {
  brand: AppliedBrand
  children: ReactNode
}) {
  return (
    <BrandContext.Provider value={brand}>
      <div
        className="contents"
        data-lti-brand={brand.name ? brand.scheme : 'default'}
        style={brand.cssVars}
      >
        {/* its own confirm dialog, inside the brand scope, so it wears the tenant's look */}
        <ConfirmProvider>{children}</ConfirmProvider>
      </div>
    </BrandContext.Provider>
  )
}

/** The applied brand inside an LTI route; null everywhere else. */
export function useLtiBrand(): AppliedBrand | null {
  return useContext(BrandContext)
}

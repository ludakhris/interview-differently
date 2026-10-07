// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceSwitcher, switchHref } from './WorkspaceSwitcher'

vi.mock('./app-context', () => ({
  useApp: () => ({
    fixedTenant: false,
    tenant: 'cedarmill',
    workspaces: [
      { id: 'a', name: 'Delaware', kind: 'agency', subdomain: 'delaware', parentId: null },
      {
        id: 'p',
        name: 'Cedar Mill',
        kind: 'provider',
        subdomain: 'cedarmill',
        parentId: 'a',
        featuredDemo: true,
      },
    ],
  }),
}))

afterEach(cleanup)

describe('WorkspaceSwitcher', () => {
  it('stars featured demo workspaces in the dropdown', () => {
    render(<WorkspaceSwitcher />)
    expect(screen.getByRole('option', { name: '⭐ Cedar Mill (Provider)' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Delaware' })).toBeTruthy()
  })

  it('keeps the section when switching workspace', () => {
    const prov = { subdomain: 'cedar', kind: 'provider' }
    const agency = { subdomain: 'de', kind: 'agency' }
    expect(switchHref('/lms/talent', '?site=x', prov)).toBe('/lms/talent?site=cedar')
    expect(switchHref('/lms/talent/u1', '', prov)).toBe('/lms/talent?site=cedar')
    expect(switchHref('/lms/talent', '', agency)).toBe('/lms/dashboard?site=de')
    expect(switchHref('/lms/cohorts/c1', '', agency)).toBe('/lms/cohorts?site=de')
    expect(switchHref('/lms/dashboard/cohorts/c1', '', agency)).toBe('/lms/dashboard?site=de')
  })
})

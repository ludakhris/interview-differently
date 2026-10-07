// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'

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
})

// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DelawareSkinPromo } from './DelawareSkinPromo'

afterEach(cleanup)

describe('DelawareSkinPromo', () => {
  it('says the dashboard is available white-labeled and links to the Delaware version', () => {
    render(<DelawareSkinPromo href="/lms/dashboard?site=delaware&brand=delaware" />)
    expect(screen.getByText('Your agency, your brand.')).toBeTruthy()
    expect(screen.getByText('White-label')).toBeTruthy()
    expect(
      screen.getByRole('link', { name: /See the Delaware version/ }).getAttribute('href')
    ).toBe('/lms/dashboard?site=delaware&brand=delaware')
  })
})

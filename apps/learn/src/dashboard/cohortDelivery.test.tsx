// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CohortDeliveryChip } from './CohortsPage'

afterEach(cleanup)

describe('CohortDeliveryChip', () => {
  it.each([
    ['online', 'Online', /self-paced/],
    ['live', 'Live', /scheduled times/],
    ['hybrid', 'Hybrid', /online work plus live/],
  ] as const)('shows %s as a chip with an explanation', (delivery, label, hint) => {
    render(<CohortDeliveryChip delivery={delivery} />)
    const chip = screen.getByText(label)
    expect(chip.className).toContain('dash-chip-delivery-' + delivery)
    expect(chip.getAttribute('title')).toMatch(hint)
  })
})

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'

vi.mock('./SiteAccountMenu', () => ({ SiteAccountMenu: () => null }))

import { SiteFooter, STATUS_PAGE_URL } from './SiteFooter'
import { HomePage } from '../pages/HomePage'

afterEach(cleanup)

const footerLinks = () => within(screen.getByRole('navigation', { name: 'Footer' }))

describe('SiteFooter', () => {
  it('shows the status badge, titled, from the status page, at a fixed size', () => {
    render(<SiteFooter />)
    const badge = screen.getByTitle('Learn Differently system status')
    expect(badge.tagName).toBe('IFRAME')
    expect(badge.getAttribute('src')).toBe(`${STATUS_PAGE_URL}/badge?theme=dark`)
    expect(badge.getAttribute('width')).toBe('250')
    expect(badge.getAttribute('height')).toBe('30')
    expect(badge.getAttribute('loading')).toBe('lazy')
  })

  it('links Products to the homepage section by default, in its own dark strip', () => {
    render(<SiteFooter />)
    expect(footerLinks().getByRole('link', { name: 'Products' }).getAttribute('href')).toBe(
      '/#team'
    )
    expect(document.querySelector('.ld-site-footer')).toBeTruthy()
  })

  it('is the homepage footer, inside its dark section, with Products on the same page', () => {
    render(<HomePage />)
    expect(screen.getByText('Training that adapts. Admin work, automated.')).toBeTruthy()
    expect(footerLinks().getByRole('link', { name: 'Products' }).getAttribute('href')).toBe('#team')
    expect(screen.getByTitle('Learn Differently system status')).toBeTruthy()
    expect(document.querySelector('.ld-cta .ld-footer')).toBeTruthy()
    expect(document.querySelector('.ld-site-footer')).toBeNull()
  })
})

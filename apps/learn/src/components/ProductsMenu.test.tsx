// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ProductsMenu } from './ProductsMenu'
import { appProductPath, productPagePath, type Product } from '../products'

afterEach(cleanup)

const open = (hrefFor: (p: Product) => { href: string } | null) => {
  render(<ProductsMenu hrefFor={hrefFor} />)
  fireEvent.click(screen.getByRole('button', { name: /Products/ }))
}
const item = (name: string) => screen.getByText(name).closest('li') as HTMLElement

describe('ProductsMenu', () => {
  it('on the public site, sends Micro Learning and Skill Simulator to their product pages', () => {
    open((p) => ({ href: productPagePath(p) }))
    expect(item('Micro Learning').querySelector('a')?.getAttribute('href')).toBe(
      '/products/micro-learning'
    )
    expect(item('Skill Simulator').querySelector('a')?.getAttribute('href')).toBe(
      '/products/skill-simulator'
    )
  })

  it('no longer marks Micro Learning as coming soon', () => {
    open((p) => ({ href: productPagePath(p) }))
    expect(item('Micro Learning').textContent).not.toContain('Coming soon')
    expect(item('Skill Simulator').textContent).not.toContain('Coming soon')
    expect(item('Job Board Match').textContent).toContain('Coming soon')
  })

  it('in the signed-in app, opens the LMS itself and the product pages for Spark and the Simulator', () => {
    open((p) => {
      const to = appProductPath(p)
      return to ? { href: to } : null
    })
    expect(item('Learning Management (LMS)').querySelector('a')?.getAttribute('href')).toBe(
      '/lms/dashboard'
    )
    expect(item('Micro Learning').querySelector('a')?.getAttribute('href')).toBe(
      '/products/micro-learning'
    )
    expect(item('Skill Simulator').querySelector('a')?.getAttribute('href')).toBe(
      '/products/skill-simulator'
    )
    expect(item('Talent Match').querySelector('a')).toBeNull()
  })
})

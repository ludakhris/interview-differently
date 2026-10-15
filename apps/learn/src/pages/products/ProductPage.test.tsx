// @vitest-environment jsdom
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'

vi.mock('../../components/SiteAccountMenu', () => ({ SiteAccountMenu: () => null }))

import { ProductPage } from './ProductPage'
import { PRODUCTS } from '../../products'

afterEach(() => {
  cleanup()
  window.history.pushState({}, '', '/')
})

const headings = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)

describe('ProductPage', () => {
  it('names the LMS and its role from the registry, in the list of five', () => {
    render(<ProductPage id="lms" />)
    expect(screen.getByText(/COMPONENT 1 OF 5 · FOUNDATION/)).toBeTruthy()
    expect(headings()).toEqual(['How it works', 'One application, five components.'])
    const five = screen.getByRole('link', { current: 'page' })
    expect(five.textContent).toContain('Learning Management (LMS)')
    expect(five.textContent).toContain('01 · FOUNDATION')
  })

  it('shows Spark as a lesson for one gap, the course path, one lesson row, how it works and the library', () => {
    render(<ProductPage id="micro-learning" />)
    expect(headings()).toEqual([
      'Help added where the gap showed',
      'A lesson made for one learner',
      'How it works',
      'One application, five components.',
    ])
    expect(screen.getByText(/When a knowledge gap is discovered/)).toBeTruthy()
    expect(screen.getAllByText(/oversee the lessons that are generated/)).toHaveLength(2)
    expect(screen.queryByText(/BY HAND TODAY/)).toBeNull()
    expect(screen.getByRole('img', { name: /three learners/ })).toBeTruthy()
    expect(screen.getByText('ONE COURSE PATH, ADJUSTED AS THEY LEARN')).toBeTruthy()
    expect(screen.getAllByRole('img').map((img) => img.getAttribute('src'))).toEqual([
      null,
      '/site/products/spark-lesson.png',
    ])
    expect(document.querySelectorAll('.pp-journey-list li')).toHaveLength(4)
    expect(screen.getByText('A micro-learning library that grows')).toBeTruthy()
    expect(screen.queryByText(/is in development/)).toBeNull()
  })

  it('shows the Skill Simulator as two simulations in their own rows, five steps, and the standalone callout', () => {
    render(<ProductPage id="skill-simulator" />)
    const cta = screen.getByRole('link', { name: 'Open Interview Differently' })
    expect(cta.getAttribute('href')).toBe('https://interviewdifferently.com')
    expect(screen.getByRole('link', { name: 'Book a walkthrough' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Simulate the actual job. Identify the skill gap.'
    )
    expect(screen.queryByText(/BY HAND TODAY/)).toBeNull()
    const hero = document.querySelector('.pp-hero') as HTMLElement
    expect(hero.children).toHaveLength(2)
    expect(within(hero).getByRole('img', { name: /scorecard/ })).toBeTruthy()
    expect(screen.getByText(/data analytics, incident response, business decisions/)).toBeTruthy()
    expect(screen.getByText(/New ones are added regularly/)).toBeTruthy()
    expect(headings()).toEqual([
      'Learner Simulations',
      'How it works',
      'One application, five components.',
    ])
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Simulation 1: Data request',
      'Simulation 2: On-call incident',
    ])
    expect(screen.getByRole('img', { name: /a data request/ })).toBeTruthy()
    expect(screen.getByRole('img', { name: /an on-call incident/ })).toBeTruthy()
    expect(screen.queryByText(/customer support/i)).toBeNull()
    expect(screen.getAllByText('You (learner)')).toHaveLength(2)
    expect(document.querySelectorAll('img')).toHaveLength(0)
    expect(document.querySelectorAll('.pp-journey-list li')).toHaveLength(5)
    expect(screen.getByText('Practice outside the course, too')).toBeTruthy()
  })

  it('never says “Video made for you” or “fictional”', () => {
    for (const id of ['micro-learning', 'skill-simulator']) {
      const { container } = render(<ProductPage id={id} />)
      const text = container.innerHTML
      expect(text).not.toMatch(/made for you/i)
      expect(text).not.toMatch(/fictional/i)
      expect(text).not.toMatch(/\ba miss\b/i)
      cleanup()
    }
  })

  it('plays each chat one message at a time', () => {
    vi.useFakeTimers()
    try {
      render(<ProductPage id="skill-simulator" />)
      const shown = () =>
        [...document.querySelectorAll('.pd-chat')].map(
          (c) => c.querySelectorAll('.pd-msg.is-on').length
        )
      expect(shown()).toEqual([1, 1])
      act(() => vi.advanceTimersByTime(1600))
      expect(shown()).toEqual([2, 1])
      act(() => vi.advanceTimersByTime(3200))
      expect(shown()).toEqual([4, 2])
      act(() => vi.advanceTimersByTime(4800))
      expect(shown()).toEqual([4, 5])
    } finally {
      vi.useRealTimers()
    }
  })

  it('plays the course path step by step: a gap, help added, then job ready', () => {
    vi.useFakeTimers()
    try {
      render(<ProductPage id="micro-learning" />)
      const path = () => screen.getByRole('list', { name: 'Path, scaled by time' })
      expect(within(path()).queryByText('Added')).toBeNull()
      expect(within(path()).queryByText('✓ Job ready')).toBeNull()
      act(() => vi.advanceTimersByTime(1300 * 3))
      expect(screen.getByText(/Gap found/)).toBeTruthy()
      act(() => vi.advanceTimersByTime(1300))
      expect(within(path()).getAllByText('Added')).toHaveLength(2)
      expect(within(path()).getByText(/Finding Missing Values: IS NULL, Not = NULL/)).toBeTruthy()
      act(() => vi.advanceTimersByTime(1300 * 6))
      expect(within(path()).getByText('✓ Job ready')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows Spark’s hero as three learners with a lesson each, in plain words with no SQL', () => {
    render(<ProductPage id="micro-learning" />)
    const hero = document.querySelector('.pp-hero') as HTMLElement
    expect(
      within(hero)
        .getAllByRole('listitem')
        .map((li) => li.textContent)
    ).toEqual([
      'MMaya pulled the wrong rows for a reportPicking out the right rows▶ 2 min',
      'TTheo couldn’t total sales by regionAdding up totals by group▶ 2 min',
      'AAna got stuck linking customers to ordersMatching customers to their orders▶ 1 min',
    ])
    expect(hero.textContent).not.toMatch(/SQL|NULL|SELECT|WHERE|GROUP BY|scene/i)
    expect(hero.textContent).not.toMatch(/adds it/)
    expect(hero.querySelector('.pd-lesson')).toBeNull()
  })

  it('walks the lesson pipeline step by step, the review marked optional, ending on the player', () => {
    vi.useFakeTimers()
    try {
      render(<ProductPage id="micro-learning" />)
      const rail = screen.getByRole('list', { name: 'How this lesson was made' })
      const steps = within(rail).getAllByRole('listitem')
      expect(steps.map((li) => li.textContent)).toEqual([
        '✓Gap identified',
        '2AI-generated',
        '3Instructor reviewsoptional',
        '4Video ready',
      ])
      const frame = () => document.querySelector('.pd-pipe-frame') as HTMLElement
      expect(frame().className).not.toContain('is-on')
      act(() => vi.advanceTimersByTime(1300 * 3))
      expect(rail.querySelectorAll('.pd-pipe-step.is-on')).toHaveLength(4)
      expect(frame().className).toContain('is-on')
      expect(frame().querySelector('img')?.getAttribute('src')).toBe(
        '/site/products/spark-lesson.png'
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('puts the One gap, one lesson text on the left and its picture on the right', () => {
    render(<ProductPage id="micro-learning" />)
    const row = screen
      .getByRole('heading', { name: 'A lesson made for one learner' })
      .closest('section') as HTMLElement
    expect(row.className).toContain('pp-row-flip')
    expect(row.firstElementChild?.className).toBe('pp-row-copy')
    expect(row.lastElementChild?.className).toBe('pp-row-visual')
  })

  it('shows the chosen phrases of each headline in orange', () => {
    const want = {
      lms: ['without the spreadsheets'],
      'micro-learning': ['exact skill'],
      'skill-simulator': ['Simulate'],
    }
    for (const [id, phrase] of Object.entries(want)) {
      render(<ProductPage id={id} />)
      const h1 = screen.getByRole('heading', { level: 1 })
      expect([...h1.querySelectorAll('.ld-orange')].map((e) => e.textContent)).toEqual(phrase)
      expect(h1.textContent).toBe(PRODUCTS.find((p) => p.id === id)?.headline)
      cleanup()
    }
  })

  it('makes Book a walkthrough the navy button on every product page', () => {
    for (const { id } of PRODUCTS) {
      render(<ProductPage id={id} />)
      const book = screen.getByRole('link', { name: 'Book a walkthrough' })
      expect(book.className).toContain('pp-btn-book')
      expect(book.className).not.toContain('ld-btn-orange')
      cleanup()
    }
    render(<ProductPage id="skill-simulator" />)
    expect(screen.getByRole('link', { name: 'Open Interview Differently' }).className).toContain(
      'ld-btn-orange'
    )
  })

  it('puts an emoji on each For your team callout', () => {
    for (const [id, emoji] of [
      ['lms', '📊'],
      ['micro-learning', '📚'],
      ['skill-simulator', '🔁'],
      ['job-board-match', '🎯'],
      ['talent-match', '🤝'],
    ]) {
      render(<ProductPage id={id} />)
      const callout = screen.getByText('FOR YOUR TEAM').closest('aside') as HTMLElement
      expect(callout.querySelector('.pp-callout-emoji')?.textContent).toBe(emoji)
      cleanup()
    }
  })

  describe('Simulator rows', () => {
    it('gives the simulations intro the full content width', () => {
      render(<ProductPage id="skill-simulator" />)
      const intro = screen.getByRole('heading', { name: 'Learner Simulations' })
        .parentElement as HTMLElement
      expect(intro.className).toBe('pp-sims-head')
      expect(intro.className).not.toContain('pp-five-head')
    })

    it('puts each simulation on its own row, text first, alternating sides, with a few plain sentences', () => {
      render(<ProductPage id="skill-simulator" />)
      const rows = [...document.querySelectorAll('.pp-sims > .pp-sim')] as HTMLElement[]
      expect(rows).toHaveLength(2)
      expect(rows.map((r) => r.classList.contains('pp-sim-flip'))).toEqual([false, true])
      for (const row of rows) {
        expect(row.firstElementChild?.className).toBe('pp-sim-copy')
        expect(row.lastElementChild?.querySelector('.pd-chat')).toBeTruthy()
        const paras = row.querySelectorAll('.pp-sim-copy p')
        expect(paras.length).toBeGreaterThanOrEqual(2)
        expect(paras.length).toBeLessThanOrEqual(3)
        expect(row.querySelector('.pp-sim-copy')?.textContent).toMatch(/scored on/)
      }
      expect(rows[0].textContent).toMatch(/SQL/)
      expect(rows[1].textContent).toMatch(/incident response/)
    })
  })

  describe('How it works', () => {
    const show = (id: string, search = '') => {
      window.history.pushState({}, '', `/products/${id}${search}`)
      render(<ProductPage id={id} />)
    }
    const lit = () => document.querySelectorAll('.pp-journey-list li.is-on').length

    it('is one vertical journey on every product page, with its steps and no review switch', () => {
      for (const { id, steps } of PRODUCTS) {
        expect(steps?.length).toBeGreaterThanOrEqual(4)
        expect(steps?.length).toBeLessThanOrEqual(5)
        show(id, '?how=a')
        expect(headings()).toContain('How it works')
        expect(headings()).not.toContain('What it does')
        expect(screen.queryByText(/for learners/i)).toBeNull()
        expect(screen.getByText('FOR YOUR TEAM')).toBeTruthy()
        expect(document.querySelectorAll('.pp-journey')).toHaveLength(1)
        expect(
          [...document.querySelectorAll('.pp-journey-text')].map((e) => e.textContent)
        ).toEqual(steps)
        expect(document.querySelector('.pp-flow, .hx-a, .hx-b, .hx-c')).toBeNull()
        expect(screen.queryByRole('navigation', { name: /under review/ })).toBeNull()
        cleanup()
      }
    })

    it('moves the token stop to stop, lighting each step as it arrives', () => {
      vi.useFakeTimers()
      try {
        show('skill-simulator')
        const token = () => document.querySelector('.pp-journey-token')?.textContent
        expect(lit()).toBe(1)
        expect(token()).toBe('🏢')
        act(() => vi.advanceTimersByTime(1400))
        expect(lit()).toBe(2)
        expect(token()).toBe('🛠️')
        act(() => vi.advanceTimersByTime(1400 * 3))
        expect(lit()).toBe(5)
        expect(token()).toBe('✅')
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('Heroes', () => {
    it('draws the LMS as the hub of the other four, named and with their emoji from the registry', () => {
      render(<ProductPage id="lms" />)
      const hub = within(document.querySelector('.pp-hero') as HTMLElement).getByRole('img', {
        name: /Learning Management \(LMS\) in the middle, joined to Micro Learning, Skill Simulator, Job Board Match, Talent Match/,
      })
      expect(hub.querySelector('.pd-hub-centre')?.textContent).toContain(
        '🏛️Learning Management (LMS)'
      )
      const nodes = [...hub.querySelectorAll('.pd-hub-node')]
      expect(nodes.map((n) => n.textContent)).toEqual([
        '💡Micro LearningSPARK',
        '🕹️Skill SimulatorPRACTICE',
        '🔎Job Board MatchCOMING SOON',
        '🤝Talent MatchCOMING SOON',
      ])
      expect(nodes.map((n) => n.classList.contains('is-soon'))).toEqual([false, false, true, true])
      expect(hub.querySelectorAll('line')).toHaveLength(4)
      expect(document.querySelector('.pp-swap')).toBeNull()
    })

    it('gives the Simulator and the coming-soon pages a card on the right, in plain words, and no By hand today cards', () => {
      const want = {
        'skill-simulator': /SIMULATION SCORECARD/,
        'job-board-match': /ROLE MATCH/,
        'talent-match': /VERIFIED TALENT PROFILE/,
      }
      for (const [id, tag] of Object.entries(want)) {
        render(<ProductPage id={id} />)
        const hero = document.querySelector('.pp-hero') as HTMLElement
        expect(hero.lastElementChild?.className).toBe('pd-card')
        expect(hero.lastElementChild?.getAttribute('role')).toBe('img')
        expect(hero.textContent).toMatch(tag)
        expect(hero.textContent).not.toMatch(/BY HAND TODAY|SQL|SELECT|WHERE/)
        expect(document.querySelector('.pp-swap')).toBeNull()
        cleanup()
      }
    })

    it('shows the Simulator scorecard: scenario, skill, scored criteria with a gap, and the evidence saved', () => {
      vi.useFakeTimers()
      try {
        render(<ProductPage id="skill-simulator" />)
        const card = document.querySelector('.pp-hero .pd-card') as HTMLElement
        expect(card.textContent).toContain('Weekly sales report for a store manager')
        expect(card.textContent).toContain('Summarizing data')
        expect(card.querySelectorAll('li.is-met')).toHaveLength(3)
        expect(card.querySelectorAll('li.is-gap')).toHaveLength(1)
        const footer = () => card.querySelector('.pd-card-footer') as HTMLElement
        expect(footer().textContent).toBe('Evidence saved to the learner’s record')
        expect(footer().className).not.toContain('is-on')
        expect(card.querySelectorAll('li.is-on')).toHaveLength(1)
        act(() => vi.advanceTimersByTime(1300 * 4))
        expect(card.querySelectorAll('li.is-on')).toHaveLength(4)
        expect(footer().className).toContain('is-on')
      } finally {
        vi.useRealTimers()
      }
    })

    it('keeps the in development note on the coming-soon pages', () => {
      for (const id of ['job-board-match', 'talent-match']) {
        render(<ProductPage id={id} />)
        expect(screen.getByText(/is in development/)).toBeTruthy()
        cleanup()
      }
    })
  })

  it('with reduced motion, shows every picture finished at once', () => {
    const matchMedia = window.matchMedia
    window.matchMedia = ((q: string) => ({ matches: q.includes('reduce') })) as typeof matchMedia
    try {
      render(<ProductPage id="micro-learning" />)
      const path = screen.getByRole('list', { name: 'Path, scaled by time' })
      expect(within(path).getAllByText('Added')).toHaveLength(2)
      expect(
        within(path).getByText('Gap: Pull the right customers and orders was at 50%')
      ).toBeTruthy()
      expect(within(path).getByText('✓ Job ready')).toBeTruthy()
      expect(document.querySelectorAll('.pd-pipe-step:not(.is-on)')).toHaveLength(0)
      expect(document.querySelector('.pd-pipe-frame')?.className).toContain('is-on')
      cleanup()
      expect(document.querySelectorAll('.pp-journey-list li:not(.is-on)')).toHaveLength(0)
      cleanup()
      render(<ProductPage id="skill-simulator" />)
      expect(document.querySelectorAll('.pd-msg:not(.is-on)')).toHaveLength(0)
      expect(document.querySelectorAll('.pd-msg.is-on')).toHaveLength(9)
      expect(document.querySelectorAll('.pp-journey-list li.is-on')).toHaveLength(5)
      expect(document.querySelector('.pp-journey-token')?.textContent).toBe('✅')
      expect(document.querySelectorAll('.pd-card li:not(.is-on)')).toHaveLength(0)
      expect(document.querySelector('.pd-card-footer')?.className).toContain('is-on')
    } finally {
      window.matchMedia = matchMedia
    }
  })

  it('ships every screenshot it links', () => {
    for (const shot of PRODUCTS.flatMap((p) => p.shots ?? []))
      expect(existsSync(resolve(__dirname, '../../../public', shot.src.slice(1)))).toBe(true)
  })
})

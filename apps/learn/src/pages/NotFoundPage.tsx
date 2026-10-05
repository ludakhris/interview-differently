import { SimpleShell } from './SimpleShell'

export function NotFoundPage() {
  return (
    <SimpleShell>
      <h1 className="ld-h2">Page not found</h1>
      <p className="ld-sub">
        There is no page at this address. <a href="/">Go to the home page</a>.
      </p>
    </SimpleShell>
  )
}

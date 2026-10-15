/**
 * Posts the launch fields to the tool: in this same window by default (the tool sends the learner back with a return
 * link), or in a named frame on this page for an embedded tool. Values are set as properties, never as HTML.
 */
export function submitLaunchForm(action: string, fields: Record<string, string>, target = '_self') {
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = action
  form.target = target
  form.style.display = 'none'
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = name
    input.value = value
    form.appendChild(input)
  }
  document.body.appendChild(form)
  form.submit()
  form.remove()
}

import { STAFF_ONLY_REMINDER } from './supportLogic'
import './notes.css'

/** The standing reminder on every notes and support screen. */
export function StaffOnlyReminder() {
  return <p className="nt-reminder">{STAFF_ONLY_REMINDER}</p>
}

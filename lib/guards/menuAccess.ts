type EventLike = {
  state: string
  menu_enabled: boolean
  rsvp_deadline: string | null
}

export function canGuestEditMenu(event: EventLike) {
  if (event.state !== 'active') return false
  if (!event.menu_enabled) return false
  if (event.rsvp_deadline && new Date() > new Date(event.rsvp_deadline)) return false
  return true
}

export function canHostEditMenu(event: EventLike) {
  if (event.rsvp_deadline && new Date() > new Date(event.rsvp_deadline)) {
    return false
  }
  return true
}

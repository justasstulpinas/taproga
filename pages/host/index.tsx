// pages/host/index.tsx

import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabaseClient'

type EventRow = {
  id: string
  title: string
  slug: string
  state: string
  guest_access_enabled: boolean
}

export default function HostHome() {
  const router = useRouter()
  const [events, setEvents] = useState<EventRow[]>([])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.replace('/login')
        return
      }

      const { data: rows, error } = await supabase
        .from('events')
        .select('id, title, slug, state, guest_access_enabled')
        .order('created_at', { ascending: false })

      if (!error) setEvents(rows || [])
    })
  }, [router])

  async function toggleGuestAccess(id: string, enabled: boolean) {
    const { error } = await supabase
      .from('events')
      .update({ guest_access_enabled: !enabled })
      .eq('id', id)

    if (error) {
      alert(error.message)
      return
    }

    setEvents((prev) =>
      prev.map((e) =>
        e.id === id ? { ...e, guest_access_enabled: !enabled } : e
      )
    )
  }

  return (
    <main>
      <h1>Host Dashboard</h1>

      <button onClick={() => router.push('/host/new')}>
        Create event
      </button>

      <ul>
        {events.map((e) => (
          <li key={e.id}>
            {e.title} — {e.state} — guest access:{' '}
            <button
              onClick={() => toggleGuestAccess(e.id, e.guest_access_enabled)}
            >
              {e.guest_access_enabled ? 'ON' : 'OFF'}
            </button>
          </li>
        ))}
      </ul>
    </main>
  )
}

// pages/host/new.tsx

import { useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabaseClient'

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[ą]/g, 'a')
    .replace(/[č]/g, 'c')
    .replace(/[ęė]/g, 'e')
    .replace(/[į]/g, 'i')
    .replace(/[š]/g, 's')
    .replace(/[ųū]/g, 'u')
    .replace(/[ž]/g, 'z')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default function NewEventPage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [timezone, setTimezone] = useState('Europe/Vilnius')

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()

    // basic validation
    if (!title.trim()) {
      alert('Title is required')
      return
    }
    if (!date) {
      alert('Date is required')
      return
    }
    if (!time) {
      alert('Time is required')
      return
    }

    const baseSlug = slugify(title)

    // avoid slug collision
    const { count } = await supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .ilike('slug', `${baseSlug}%`)

    const slug = count && count > 0 ? `${baseSlug}-${count + 1}` : baseSlug

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      alert('Not authenticated')
      return
    }

    const { data, error } = await supabase
      .from('events')
      .insert({
        title,
        event_date: new Date(`${date}T${time}:00+02:00`), // Europe/Vilnius
        event_timezone: timezone,
        slug,
        tier: 1,
        host_id: session.user.id,
      })
      .select('draft_token')
      .single()

    if (error) {
      alert(error.message)
      return
    }

    router.replace(`/e/${slug}?draft=${data.draft_token}`)
  }

  return (
    <form onSubmit={handleCreate}>
      <h1>Create Event</h1>

      <input
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />

      <input
        type="time"
        value={time}
        onChange={(e) => setTime(e.target.value)}
      />

      <input
        placeholder="Timezone"
        value={timezone}
        onChange={(e) => setTimezone(e.target.value)}
      />

      <button type="submit">Create</button>
    </form>
  )
}

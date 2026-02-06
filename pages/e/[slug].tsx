import { GetServerSideProps } from 'next'
import { createClient } from '@supabase/supabase-js'

type Props = {
  title: string
}

export default function EventPreview({ title }: Props) {
  return (
    <main>
      <h1>{title}</h1>
      <p>Draft preview</p>
    </main>
  )
}

export const getServerSideProps: GetServerSideProps = async ({ params, query }) => {
  const slug = params?.slug as string
  const draft = query.draft as string | undefined

  if (!slug || !draft) {
    return { notFound: true }
  }

  // SERVER-ONLY client (bypasses RLS)
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await supabaseAdmin
    .from('events')
    .select('title')
    .eq('slug', slug)
    .eq('draft_token', draft)
    .eq('state', 'draft')
    .single()

  if (error || !data) {
    return { notFound: true }
  }

  return {
    props: {
      title: data.title,
    },
  }
}

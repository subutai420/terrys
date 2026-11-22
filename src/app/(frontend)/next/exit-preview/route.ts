import { draftMode } from 'next/headers'
import { redirect } from 'next/navigation'

/** Turns the editor preview (draft mode) off and returns to the given page. */
export async function GET(request: Request): Promise<Response> {
  ;(await draftMode()).disable()
  const path = new URL(request.url).searchParams.get('path') ?? '/'
  redirect(path.startsWith('/') && !path.startsWith('//') ? path : '/')
}

/**
 * Minimal strict XML well-formedness check for the feed tests (no XML parser dependency):
 * one root element, every tag closed in order, attribute quotes, only the five predefined
 * entities or numeric references, no bare "<" or "&" in text. Throws with the position.
 */
export function assertWellFormedXml(xml: string): void {
  const body = xml.replace(/^<\?xml[^?]*\?>\s*/, '')
  const stack: string[] = []
  let roots = 0
  let i = 0
  const fail = (message: string) => {
    throw new Error(`${message} at ${i}: …${body.slice(Math.max(0, i - 40), i + 40)}…`)
  }
  while (i < body.length) {
    const lt = body.indexOf('<', i)
    const text = body.slice(i, lt === -1 ? body.length : lt)
    if (/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(text)) fail('Bare &')
    if (text.trim() && stack.length === 0) fail('Text outside the root')
    if (lt === -1) break
    i = lt
    const gt = body.indexOf('>', i)
    if (gt === -1) fail('Unclosed tag')
    const tag = body.slice(i + 1, gt)
    if (tag.startsWith('/')) {
      const name = tag.slice(1).trim()
      if (stack.pop() !== name) fail(`Unexpected </${name}>`)
    } else {
      const selfClosing = tag.endsWith('/')
      const match = tag.match(/^([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*\/?$/)
      if (!match) fail(`Invalid tag <${tag}>`)
      if (stack.length === 0) roots++
      if (roots > 1) fail('More than one root element')
      if (!selfClosing) stack.push((match as RegExpMatchArray)[1])
    }
    i = gt + 1
  }
  if (stack.length) throw new Error(`Unclosed elements: ${stack.join(' > ')}`)
  if (roots !== 1) throw new Error('No root element')
}

/**
 * Tiny command-line option parser: `--flag`, `--name=value`, `--name value`.
 * Payload's `payload run` passes only arguments after `--` to the script, which is why the
 * package.json scripts end with `--`.
 */
export function parseArgs(argv: string[]) {
  const values = new Map<string, string | true>()
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--') || arg === '--') continue
    const [name, value] = arg.slice(2).split(/=(.*)/s, 2)
    if (value !== undefined) values.set(name, value)
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) values.set(name, argv[++i])
    else values.set(name, true)
  }
  return {
    flag: (name: string) => values.get(name) === true || values.get(name) === 'true',
    string: (name: string) => {
      const v = values.get(name)
      return typeof v === 'string' ? v : undefined
    },
    number: (name: string) => {
      const v = values.get(name)
      return typeof v === 'string' && Number.isFinite(Number(v)) ? Number(v) : undefined
    },
  }
}

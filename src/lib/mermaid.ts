// mermaid is heavy (d3, katex, cytoscape, ...). Load it lazily on first render
// (i.e. when the ERD tab is first opened) so it stays out of the initial bundle.

let render: ((id: string, code: string) => Promise<{ svg: string }>) | null = null

async function ensure() {
  if (!render) {
    const mermaid = (await import('mermaid')).default
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose',
      er: { useMaxWidth: true },
    })
    render = (id, code) => mermaid.render(id, code).then((r) => ({ svg: r.svg }))
  }
  return render
}

let counter = 0

export async function renderMermaid(code: string): Promise<string> {
  const r = await ensure()
  const { svg } = await r(`mmd-${counter++}`, code)
  return svg
}

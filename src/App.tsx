import { useRef, useState, type DragEvent } from 'react'

type FoodItem = {
  name: string
  portion: string
  grams: number
  confidence: number
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  saturated_fat_g: number
  fiber_g: number
  sugar_g: number
  sodium_mg: number
}
type Analysis = { summary: string; items: FoodItem[]; notes: string[] }
type Photo = { file: File; url: string }
const MAX_SIZE = 10 * 1024 * 1024
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']

function total(items: FoodItem[], key: keyof FoodItem) {
  return items.reduce((sum, item) => sum + (typeof item[key] === 'number' ? item[key] as number : 0), 0)
}
function show(value: number, decimals = 0) { return Number(value.toFixed(decimals)).toLocaleString('es-CO') }

export default function App() {
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const gallery = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)

  function selectFile(file?: File) {
    if (!file) return
    setError('')
    if (!ACCEPTED.includes(file.type)) return setError('Usa una imagen JPG, PNG o WEBP.')
    if (file.size > MAX_SIZE) return setError('La imagen debe pesar menos de 10 MB.')
    setPhoto(current => {
      if (current) URL.revokeObjectURL(current.url)
      return { file, url: URL.createObjectURL(file) }
    })
    setAnalysis(null)
  }
  function dropFile(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    selectFile(event.dataTransfer.files[0])
  }
  function clearPhoto() {
    setPhoto(current => { if (current) URL.revokeObjectURL(current.url); return null })
    setAnalysis(null)
    setError('')
  }
  async function analyze() {
    if (!photo || busy) return
    setBusy(true); setError(''); setAnalysis(null)
    const data = new FormData()
    data.append('image', photo.file)
    try {
      const response = await fetch('/api/analyze', { method: 'POST', body: data })
      const payload = await response.json().catch(() => ({})) as { detail?: string } & Partial<Analysis>
      if (!response.ok) throw new Error(payload.detail || 'No se pudo analizar la foto. Revisa que el servidor y la clave de API estén configurados.')
      if (!payload.items?.length) throw new Error('No se detectaron alimentos con suficiente claridad. Prueba con otra foto.')
      setAnalysis(payload as Analysis)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Ocurrió un error al analizar la imagen.')
    } finally { setBusy(false) }
  }
  function changeGrams(index: number, raw: string) {
    const grams = Math.min(3000, Math.max(1, Number(raw) || 1))
    setAnalysis(current => current && ({ ...current, items: current.items.map((item, i) => {
      if (i !== index) return item
      const factor = grams / Math.max(item.grams, 1)
      return { ...item, grams, portion: `${grams} g`, calories: item.calories * factor, protein_g: item.protein_g * factor, carbs_g: item.carbs_g * factor, fat_g: item.fat_g * factor, saturated_fat_g: item.saturated_fat_g * factor, fiber_g: item.fiber_g * factor, sugar_g: item.sugar_g * factor, sodium_mg: item.sodium_mg * factor }
    }) }))
  }

  return <div className="shell">
    <input ref={gallery} hidden type="file" accept={ACCEPTED.join(',')} onChange={e => { selectFile(e.target.files?.[0]); e.target.value = '' }} />
    <input ref={camera} hidden type="file" accept="image/*" capture="environment" onChange={e => { selectFile(e.target.files?.[0]); e.target.value = '' }} />
    <aside className="sidebar">
      <a className="brand" href="#inicio"><b>N</b> NutriScan</a><small>MENÚ PRINCIPAL</small>
      <div className="nav active">◎ <span>Escáner</span></div><div className="nav disabled">▤ <span>Diario</span></div><div className="nav disabled">◷ <span>Mi progreso</span></div><div className="nav disabled">○ <span>Perfil</span></div>
      <div className="side-note"><strong>UNA GUÍA, NO UN DIAGNÓSTICO</strong><p>Las cantidades de una foto son aproximadas. Puedes ajustar el peso para actualizar el cálculo.</p></div>
    </aside>
    <main id="inicio">
      <header><span>Tu espacio de nutrición</span><b className="avatar">N</b></header>
      <section className="intro"><small>ESCÁNER DE ALIMENTOS</small><h1>¿Qué hay en tu plato?</h1><p>Sube una foto para identificar alimentos y estimar sus porciones y nutrientes.</p></section>
      {!photo ? <section className="columns">
        <article className="card"><small>ANÁLISIS CON IA</small><h2>Empieza con una foto</h2>
          <div className="dropzone" onDragOver={e => e.preventDefault()} onDrop={dropFile}>
            <div className="upload">↑</div><h3>Arrastra tu foto aquí</h3><p>o selecciónala desde tu dispositivo</p>
            <button className="primary" onClick={() => gallery.current?.click()}>Elegir una foto</button><button className="secondary" onClick={() => camera.current?.click()}>Tomar foto</button>
            <small>JPG, PNG o WEBP · hasta 10 MB</small>
          </div>{error && <p className="error" role="alert">{error}</p>}
        </article>
        <aside className="card info"><h2>Qué recibirás</h2><p>Una estimación generada a partir de la imagen. Revísala antes de guardarla.</p>
          <div className="benefit"><b>01</b>Alimentos detectados</div><div className="benefit"><b>02</b>Porciones aproximadas</div><div className="benefit"><b>03</b>Calorías, macros y otros datos</div>
          <div className="notice"><strong>Es una estimación</strong><p>La cámara no puede medir con precisión el peso ni ver ingredientes ocultos. Confirma las porciones antes de usar estos datos.</p></div>
        </aside>
      </section> : <section className="columns selected">
        <article className="card"><div className="row"><div><small>FOTO SELECCIONADA</small><h2>Revisa tu plato</h2></div><button className="link" onClick={clearPhoto} disabled={busy}>Quitar foto</button></div>
          <img className="preview" src={photo.url} alt="Vista previa de la comida seleccionada" /><p className="filename">{photo.file.name}</p>
          {!analysis && <button className="primary analyze-button" onClick={analyze} disabled={busy}>{busy ? 'Analizando foto…' : 'Analizar mi plato'}</button>}
          {error && <p className="error" role="alert">{error}</p>}
        </article>
        <aside className="card info pending">
          {analysis ? <>
            <span className="pill">● Estimación de IA · revisa antes de guardar</span><h2>{analysis.summary}</h2>
            <div className="totals"><div><b>{show(total(analysis.items, 'calories'))}</b><small>kcal</small></div><div><b>{show(total(analysis.items, 'protein_g'), 1)} g</b><small>proteína</small></div><div><b>{show(total(analysis.items, 'carbs_g'), 1)} g</b><small>carbohidratos</small></div><div><b>{show(total(analysis.items, 'fat_g'), 1)} g</b><small>grasas</small></div></div>
            <h3 className="result-heading">Alimentos detectados</h3>
            <div className="food-list">{analysis.items.map((item, index) => <div className="food-item" key={`${item.name}-${index}`}>
              <div className="food-top"><strong>{item.name}</strong><small>{Math.round(item.confidence * 100)}% confianza</small></div><p>{item.portion}</p>
              <label className="grams-edit">Cantidad estimada <input aria-label={`Cantidad de ${item.name} en gramos`} type="number" min="1" max="3000" value={Math.round(item.grams)} onChange={e => changeGrams(index, e.target.value)} /> g</label>
              <small>{show(item.calories)} kcal · P {show(item.protein_g, 1)} g · C {show(item.carbs_g, 1)} g · G {show(item.fat_g, 1)} g</small>
              <small>Sat. {show(item.saturated_fat_g, 1)} g · fibra {show(item.fiber_g, 1)} g · azúcar {show(item.sugar_g, 1)} g · sodio {show(item.sodium_mg)} mg</small>
            </div>)}</div>
            {analysis.notes.length > 0 && <div className="notice"><strong>Ten en cuenta</strong>{analysis.notes.map((note, i) => <p key={i}>{note}</p>)}</div>}
            <button className="secondary" onClick={analyze} disabled={busy}>{busy ? 'Analizando…' : 'Volver a analizar'}</button>
          </> : <>
            <span className="pill">● Lista para analizar</span><h2>La foto está lista</h2><p>NutriScan identificará los alimentos visibles y estimará las porciones y nutrientes. La cantidad puede variar según el ángulo, la iluminación o los ingredientes ocultos.</p>
            <div className="notice"><strong>Los resultados no son mediciones</strong><p>La IA puede equivocarse. Edita el peso de cada alimento para ajustar sus nutrientes antes de registrar la comida.</p></div>
            <button className="primary" onClick={analyze} disabled={busy}>{busy ? 'Analizando foto…' : 'Analizar mi plato'}</button>
            <button className="secondary" onClick={() => gallery.current?.click()} disabled={busy}>Cambiar foto</button>
          </>}
        </aside>
      </section>}
      <div className="integration"><b>i</b> Los análisis nutricionales son aproximados y no sustituyen la orientación de un profesional de salud.</div>
      <nav className="mobile-nav"><span className="on">◎<small>Escáner</small></span><span>▤<small>Diario</small></span><span>◷<small>Progreso</small></span><span>○<small>Perfil</small></span></nav>
    </main>
  </div>
}

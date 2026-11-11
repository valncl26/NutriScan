import { useRef, useState, type DragEvent } from 'react'

export default function App() {
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null)
  const [error, setError] = useState('')
  const gallery = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)

  function selectFile(file?: File) {
    if (!file) return
    setError('')
    if (!file.type.startsWith('image/')) return setError('Selecciona un archivo de imagen.')
    if (file.size > 10 * 1024 * 1024) return setError('La imagen debe pesar menos de 10 MB.')
    if (photo) URL.revokeObjectURL(photo.url)
    setPhoto({ file, url: URL.createObjectURL(file) })
  }

  function dropFile(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    selectFile(event.dataTransfer.files[0])
  }

  function clearPhoto() {
    if (photo) URL.revokeObjectURL(photo.url)
    setPhoto(null)
    setError('')
  }

  return (
    <div className="shell">
      <input ref={gallery} hidden type="file" accept="image/png,image/jpeg,image/webp"
        onChange={e => { selectFile(e.target.files?.[0]); e.target.value = '' }} />
      <input ref={camera} hidden type="file" accept="image/*" capture="environment"
        onChange={e => { selectFile(e.target.files?.[0]); e.target.value = '' }} />
      <aside className="sidebar">
        <a className="brand" href="#inicio"><b>N</b> NutriScan</a>
        <small>MENÚ PRINCIPAL</small>
        <div className="nav active">● <span>Escáner</span></div>
        <div className="nav disabled">○ <span>Diario</span></div>
        <div className="nav disabled">○ <span>Mi progreso</span></div>
        <div className="nav disabled">○ <span>Perfil</span></div>
        <div className="side-note"><strong>UNA GUÍA, NO UN DIAGNÓSTICO</strong><p>Las cantidades de una foto son aproximadas y puedes corregirlas.</p></div>
      </aside>
      <main id="inicio">
        <header><span>Tu espacio de nutrición</span><b className="avatar">S</b></header>
        <section className="intro"><small>ESCÁNER DE ALIMENTOS</small><h1>¿Qué hay en tu plato?</h1><p>Sube una foto para revisar una estimación de sus alimentos y nutrientes.</p></section>
        {!photo ? <section className="columns">
          <article className="card">
            <small>ESCÁNER DE ALIMENTOS</small><h2>Empieza con una foto</h2>
            <div className="dropzone" onDragOver={e => e.preventDefault()} onDrop={dropFile}>
              <div className="upload">↑</div><h3>Arrastra tu foto aquí</h3><p>o selecciónala desde tu dispositivo</p>
              <button className="primary" onClick={() => gallery.current?.click()}>Elegir una foto</button>
              <button className="secondary" onClick={() => camera.current?.click()}>Tomar foto</button>
              <small>JPG, PNG o WEBP · hasta 10 MB</small>
            </div>{error && <p className="error" role="alert">{error}</p>}
          </article>
          <aside className="card info"><h2>Qué recibirás</h2><p>Una estimación que puedes revisar y ajustar.</p>
            <div className="benefit"><b>01</b>Alimentos detectados</div><div className="benefit"><b>02</b>Porciones aproximadas</div><div className="benefit"><b>03</b>Calorías y macronutrientes</div>
            <div className="notice"><strong>Importante</strong><p>La cantidad puede variar por el ángulo, la luz o los alimentos ocultos.</p></div>
          </aside>
        </section> : <section className="columns selected">
          <article className="card"><div className="row"><div><small>FOTO SELECCIONADA</small><h2>Revísala antes de continuar</h2></div><button className="link" onClick={clearPhoto}>Quitar foto</button></div>
            <img className="preview" src={photo.url} alt="Vista previa de la comida seleccionada" /><p className="filename">{photo.file.name}</p>
          </article>
          <aside className="card info pending"><span className="pill">● IA pendiente de conexión</span><h2>La foto está lista</h2>
            <p>En una etapa posterior conectaremos el análisis para identificar alimentos y estimar porciones.</p>
            <div className="notice"><strong>No mostraremos resultados inventados</strong><p>Cuando la IA esté conectada, aquí verás los alimentos detectados, la confianza y sus nutrientes estimados.</p></div>
            <button className="primary" onClick={() => gallery.current?.click()}>Cambiar foto</button><button className="secondary" onClick={clearPhoto}>Empezar de nuevo</button>
          </aside>
        </section>}
        <div className="integration"><b>i</b> El análisis de IA se conectará en una etapa posterior. Por ahora puedes probar la selección y vista previa.</div>
        <nav className="mobile-nav"><span className="on">◎<small>Escáner</small></span><span>▤<small>Diario</small></span><span>◷<small>Progreso</small></span><span>○<small>Perfil</small></span></nav>
      </main>
    </div>
  )
}

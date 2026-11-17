import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react'

type FoodItem = {
  name: string; fdc_query: string; portion: string; grams: number; confidence: number
  calories: number; protein_g: number; carbs_g: number; fat_g: number; saturated_fat_g: number
  fiber_g: number; sugar_g: number; sodium_mg: number; source?: string; reference_name?: string | null
}
type Photo = { file: File; url: string }
type Analysis = { analysis_id: number; summary: string; items: FoodItem[]; notes: string[]; created_at: string }
type DiaryEntry = { id: number; analysis_id: number | null; meal_type: string; items: FoodItem[]; created_at: string }
type User = { id: number; name: string; email: string }
type Profile = Record<string, string | number | null>
type View = 'scanner' | 'diary' | 'foods' | 'assistant' | 'profile'
type AssistantMode = 'assistant' | 'recipe' | 'plan'

const MAX_SIZE = 10 * 1024 * 1024
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']
const emptyProfile: Profile = { age: '', sex: '', height_cm: '', current_weight_kg: '', target_weight_kg: '', activity_level: 'moderado', goal: 'mejorar hábitos', food_preferences: '', allergies: '', excluded_foods: '', diet_type: 'omnívora', budget: '' }
const nutrientKeys = ['calories', 'protein_g', 'carbs_g', 'fat_g', 'saturated_fat_g', 'fiber_g', 'sugar_g', 'sodium_mg'] as const
const mealTypes = ['desayuno', 'media mañana', 'almuerzo', 'merienda', 'cena', 'otros']

function show(value: number, decimals = 0) { return Number(value.toFixed(decimals)).toLocaleString('es-CO') }
function sum(items: FoodItem[], key: typeof nutrientKeys[number]) { return items.reduce((n, item) => n + item[key], 0) }
async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  const token = sessionStorage.getItem('nutriscan-token')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const response = await fetch(path, { ...options, headers })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.detail || 'No se pudo completar la solicitud.')
  return result as T
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [view, setView] = useState<View>('scanner')
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [diary, setDiary] = useState<DiaryEntry[]>([])
  const [profile, setProfile] = useState<Profile>(emptyProfile)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' })
  const [mealType, setMealType] = useState('almuerzo')
  const [foodQuery, setFoodQuery] = useState('')
  const [foodResult, setFoodResult] = useState<{ name: string; fdc_id: number; data_type: string; source: string; per_100g: Record<string, number> } | null>(null)
  const [foodGrams, setFoodGrams] = useState('100')
  const [assistantMode, setAssistantMode] = useState<AssistantMode>('assistant')
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([])
  const [message, setMessage] = useState('')
  const gallery = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const token = sessionStorage.getItem('nutriscan-token')
    if (!token) { setAuthLoading(false); return }
    api<User>('/api/auth/me').then(setUser).catch(() => sessionStorage.removeItem('nutriscan-token')).finally(() => setAuthLoading(false))
  }, [])

  useEffect(() => {
    if (!user) return
    if (view === 'diary') api<DiaryEntry[]>('/api/diary').then(setDiary).catch(e => setError(e.message))
    if (view === 'profile') api<Profile>('/api/profile').then(p => setProfile({ ...emptyProfile, ...p })).catch(e => setError(e.message))
    if (view === 'assistant') loadChat(assistantMode)
  }, [user, view])

  async function loadChat(mode: AssistantMode) {
    try { setMessages(await api<{ role: string; content: string }[]>(`/api/chat/history?mode=${mode}`)) } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo cargar el chat.') }
  }
  async function submitAuth(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const route = authMode === 'login' ? '/api/auth/login' : '/api/auth/register'
      const result = await api<{ access_token: string; user: User }>(route, { method: 'POST', body: JSON.stringify(authForm) })
      sessionStorage.setItem('nutriscan-token', result.access_token); setUser(result.user); setError('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo iniciar sesión.') }
    finally { setBusy(false) }
  }
  function logout() { sessionStorage.removeItem('nutriscan-token'); setUser(null); setAnalysis(null); setPhoto(null); setView('scanner') }
  function selectFile(file?: File) {
    if (!file) return
    setError(''); setAnalysis(null)
    if (!ACCEPTED.includes(file.type)) return setError('Usa una imagen JPG, PNG o WEBP.')
    if (file.size > MAX_SIZE) return setError('La imagen debe pesar menos de 10 MB.')
    setPhoto(current => { if (current) URL.revokeObjectURL(current.url); return { file, url: URL.createObjectURL(file) } })
  }
  function dropFile(event: DragEvent<HTMLElement>) { event.preventDefault(); selectFile(event.dataTransfer.files[0]) }
  function clearPhoto() { setPhoto(current => { if (current) URL.revokeObjectURL(current.url); return null }); setAnalysis(null); setError('') }
  async function analyze() {
    if (!photo || busy) return
    setBusy(true); setError(''); setAnalysis(null)
    const data = new FormData(); data.append('image', photo.file)
    try { setAnalysis(await api<Analysis>('/api/analyze', { method: 'POST', body: data })) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Ocurrió un error al analizar la imagen.') }
    finally { setBusy(false) }
  }
  function changeGrams(index: number, raw: string) {
    const grams = Math.min(3000, Math.max(1, Number(raw) || 1))
    setAnalysis(current => current && ({ ...current, items: current.items.map((item, i) => {
      if (i !== index) return item
      const factor = grams / Math.max(item.grams, 1)
      return { ...item, grams, portion: `${grams} g`, ...Object.fromEntries(nutrientKeys.map(key => [key, item[key] * factor])) }
    }) }))
  }
  async function saveToDiary(items: FoodItem[], analysisId: number | null) {
    setBusy(true); setError(''); setNotice('')
    try {
      await api('/api/diary', { method: 'POST', body: JSON.stringify({ analysis_id: analysisId, meal_type: mealType, items }) })
      setNotice('Comida guardada en tu diario.'); setView('diary')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar la comida.') }
    finally { setBusy(false) }
  }
  async function deleteEntry(id: number) {
    try { await api(`/api/diary/${id}`, { method: 'DELETE' }); setDiary(rows => rows.filter(row => row.id !== id)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo eliminar.') }
  }
  async function searchFood(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setFoodResult(null)
    try { setFoodResult(await api(`/api/foods?query=${encodeURIComponent(foodQuery)}`)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo buscar el alimento.') }
    finally { setBusy(false) }
  }
  async function addCatalogFood() {
    if (!foodResult) return
    const grams = Math.max(1, Number(foodGrams) || 100); const factor = grams / 100; const n = foodResult.per_100g
    const item: FoodItem = {
      name: foodResult.name, fdc_query: foodResult.name, reference_name: foodResult.name, source: foodResult.source,
      portion: `${grams} g`, grams, confidence: 1,
      calories: (n.calories || 0) * factor, protein_g: (n.protein_g || 0) * factor, carbs_g: (n.carbs_g || 0) * factor,
      fat_g: (n.fat_g || 0) * factor, saturated_fat_g: (n.saturated_fat_g || 0) * factor,
      fiber_g: (n.fiber_g || 0) * factor, sugar_g: (n.sugar_g || 0) * factor, sodium_mg: (n.sodium_mg || 0) * factor,
    }
    await saveToDiary([item], null)
  }
  async function saveProfile(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    const numeric = ['age', 'height_cm', 'current_weight_kg', 'target_weight_kg']
    const body = Object.fromEntries(Object.entries(profile).map(([key, value]) => [key, numeric.includes(key) ? (value === '' ? null : Number(value)) : value]))
    try { setProfile({ ...emptyProfile, ...await api<Profile>('/api/profile', { method: 'PUT', body: JSON.stringify(body) }) }); setNotice('Perfil guardado.') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar el perfil.') }
    finally { setBusy(false) }
  }
  async function sendMessage(event: FormEvent) {
    event.preventDefault(); const question = message.trim(); if (!question || busy) return
    setMessage(''); setMessages(rows => [...rows, { role: 'user', content: question }]); setBusy(true); setError('')
    try { const result = await api<{ answer: string }>('/api/assistant', { method: 'POST', body: JSON.stringify({ message: question, mode: assistantMode }) }); setMessages(rows => [...rows, { role: 'assistant', content: result.answer }]) }
    catch (cause) { setMessages(rows => rows.filter(row => !(row.role === 'user' && row.content === question))); setError(cause instanceof Error ? cause.message : 'No se pudo enviar el mensaje.'); setMessage(question) }
    finally { setBusy(false) }
  }

  if (authLoading) return <div className="auth-shell"><p>Cargando NutriScan…</p></div>
  if (!user) return <div className="auth-shell"><form className="auth-card" onSubmit={submitAuth}>
    <a className="brand" href="#inicio"><b>N</b> NutriScan</a><small>ALIMENTACIÓN CONSCIENTE</small>
    <h1>{authMode === 'login' ? 'Qué bueno verte' : 'Crea tu cuenta'}</h1><p>Guarda tus análisis y conoce tu progreso.</p>
    {authMode === 'register' && <label>Nombre<input required minLength={2} value={authForm.name} onChange={e => setAuthForm({ ...authForm, name: e.target.value })} /></label>}
    <label>Correo electrónico<input required type="email" value={authForm.email} onChange={e => setAuthForm({ ...authForm, email: e.target.value })} /></label>
    <label>Contraseña<input required minLength={8} type="password" value={authForm.password} onChange={e => setAuthForm({ ...authForm, password: e.target.value })} /><small>Al menos 8 caracteres</small></label>
    {error && <p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy ? 'Un momento…' : authMode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</button>
    <button type="button" className="link" onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setError('') }}>{authMode === 'login' ? 'Crear una cuenta' : 'Ya tengo una cuenta'}</button>
    <div className="notice"><strong>Datos locales de esta instalación</strong><p>Las cuentas y comidas se guardan en la base SQLite de este computador. En otro equipo crearás una cuenta nueva.</p></div>
  </form></div>

  const nav: [View, string, string][] = [['scanner', '◎', 'Escáner'], ['diary', '▤', 'Diario'], ['foods', '⌕', 'Alimentos'], ['assistant', '✳', 'Asistente'], ['profile', '○', 'Perfil']]
  return <div className="shell">
    <input ref={gallery} hidden type="file" accept={ACCEPTED.join(',')} onChange={e => { selectFile(e.target.files?.[0]); e.target.value = '' }} />
    <input ref={camera} hidden type="file" accept="image/*" capture="environment" onChange={e => { selectFile(e.target.files?.[0]); e.target.value = '' }} />
    <aside className="sidebar"><a className="brand" href="#inicio"><b>N</b> NutriScan</a><small>MENÚ PRINCIPAL</small>
      {nav.map(([key, icon, label]) => <button key={key} className={`nav ${view === key ? 'active' : ''}`} onClick={() => { setView(key); setError(''); setNotice('') }}>{icon}<span>{label}</span></button>)}
      <div className="side-note"><strong>UNA GUÍA, NO UN DIAGNÓSTICO</strong><p>Las cantidades de una foto son aproximadas. Confirma las porciones y escucha a tu cuerpo.</p></div>
      <div className="sidebar-user"><b className="avatar">{user.name.slice(0, 1).toUpperCase()}</b><span>{user.name}</span><button className="link" onClick={logout}>Salir</button></div>
    </aside>
    <main id="inicio"><header><span>Hola, {user.name}</span><button className="avatar" onClick={() => setView('profile')}>{user.name.slice(0, 1).toUpperCase()}</button></header>
      {error && <p className="error global-message" role="alert">{error}</p>}{notice && <p className="success global-message" role="status">{notice}</p>}
      {view === 'scanner' && <>
        <section className="intro"><small>ESCÁNER DE ALIMENTOS</small><h1>¿Qué hay en tu plato?</h1><p>Sube una foto para identificar alimentos y estimar sus porciones y nutrientes.</p></section>
        {!photo ? <section className="columns"><article className="card"><small>ANÁLISIS CON IA</small><h2>Empieza con una foto</h2>
          <div className="dropzone" onDragOver={e => e.preventDefault()} onDrop={dropFile}><div className="upload">↑</div><h3>Arrastra tu foto aquí</h3><p>o selecciónala desde tu dispositivo</p>
            <button className="primary" onClick={() => gallery.current?.click()}>Elegir una foto</button><button className="secondary" onClick={() => camera.current?.click()}>Tomar foto</button><small>JPG, PNG o WEBP · hasta 10 MB</small></div></article>
          <aside className="card info"><h2>Qué recibirás</h2><p>Una estimación que puedes revisar y ajustar.</p><div className="benefit"><b>01</b>Alimentos detectados</div><div className="benefit"><b>02</b>Porciones aproximadas</div><div className="benefit"><b>03</b>Calorías, macros y nutrientes</div><div className="notice"><strong>Es una estimación</strong><p>El ángulo, la luz y los ingredientes ocultos pueden cambiar el resultado.</p></div></aside></section>
          : <section className="columns selected"><article className="card"><div className="row"><div><small>FOTO SELECCIONADA</small><h2>Revisa tu plato</h2></div><button className="link" onClick={clearPhoto} disabled={busy}>Quitar foto</button></div><img className="preview" src={photo.url} alt="Vista previa del plato" /><p className="filename">{photo.file.name}</p>{!analysis && <button className="primary analyze-button" onClick={analyze} disabled={busy}>{busy ? 'Analizando foto…' : 'Analizar mi plato'}</button>}</article>
            <aside className="card info pending">{analysis ? <><span className="pill">● Estimación · verifica el resultado</span><h2>{analysis.summary}</h2><NutrientTotals items={analysis.items} /><h3 className="result-heading">Alimentos detectados</h3><div className="food-list">{analysis.items.map((item, i) => <FoodCard key={`${item.name}-${i}`} item={item} index={i} onChange={changeGrams} />)}</div>{analysis.notes.map((note, i) => <div className="notice" key={i}><p>{note}</p></div>)}
              <label className="form-label">Añadir al diario como<select value={mealType} onChange={e => setMealType(e.target.value)}>{mealTypes.map(t => <option key={t}>{t}</option>)}</select></label><button className="primary" disabled={busy} onClick={() => saveToDiary(analysis.items, analysis.analysis_id)}>Añadir a mi diario</button><button className="secondary" disabled={busy} onClick={analyze}>Volver a analizar</button></>
              : <><span className="pill">● Lista para analizar</span><h2>La foto está lista</h2><p>Se estimarán porciones y nutrientes. No son mediciones exactas.</p><div className="notice"><strong>Los datos tienen fuentes distintas</strong><p>NutriScan usará USDA FoodData Central cuando encuentre una coincidencia; los demás valores se marcarán como estimaciones de IA.</p></div><button className="primary" onClick={analyze} disabled={busy}>{busy ? 'Analizando foto…' : 'Analizar mi plato'}</button><button className="secondary" onClick={() => gallery.current?.click()}>Cambiar foto</button></>}</aside></section>}
      </>}
      {view === 'diary' && <section className="page-section"><PageTitle eyebrow="HISTORIAL PERSONAL" title="Tu diario" subtitle="Tus comidas se guardan en esta instalación y solo son visibles desde tu cuenta." />{diary.length === 0 ? <div className="card empty-state"><h2>Aún no hay comidas guardadas</h2><p>Analiza una foto o busca un alimento para comenzar tu diario.</p><button className="primary" onClick={() => setView('scanner')}>Analizar una comida</button></div> : <div className="diary-list">{diary.map(entry => <article className="card diary-card" key={entry.id}><div className="row"><div><small>{entry.meal_type.toUpperCase()} · {new Date(entry.created_at).toLocaleString('es-CO')}</small><h2>{entry.items.map(item => item.name).join(', ')}</h2></div><button className="link" onClick={() => deleteEntry(entry.id)}>Eliminar</button></div><NutrientTotals items={entry.items} compact /><div className="diary-foods">{entry.items.map((item, index) => <p key={index}>{item.name} · {show(item.grams)} g · {show(item.calories)} kcal</p>)}</div></article>)}</div>}</section>}
      {view === 'foods' && <section className="page-section"><PageTitle eyebrow="REFERENCIA NUTRICIONAL" title="Buscar alimentos" subtitle="Consulta registros genéricos de USDA FoodData Central y guarda una porción en tu diario." />
        <form className="card search-form" onSubmit={searchFood}><label>Alimento<input value={foodQuery} onChange={e => setFoodQuery(e.target.value)} placeholder="Ej. arroz cocido, banana, pechuga de pollo" minLength={2} required /></label><button className="primary" disabled={busy}>{busy ? 'Buscando…' : 'Buscar en USDA'}</button></form>
        {foodResult && <article className="card food-result"><small>{foodResult.source} · {foodResult.data_type} · FDC {foodResult.fdc_id}</small><h2>{foodResult.name}</h2><p>Valores de referencia por 100 g</p><div className="nutrient-strip">{nutrientKeys.map(key => <span key={key}><b>{show(foodResult.per_100g[key] || 0, 1)}</b><small>{nutrientLabel[key]}</small></span>)}</div><label className="form-label">Cantidad (g)<input type="number" min="1" max="3000" value={foodGrams} onChange={e => setFoodGrams(e.target.value)} /></label><label className="form-label">Añadir como<select value={mealType} onChange={e => setMealType(e.target.value)}>{mealTypes.map(t => <option key={t}>{t}</option>)}</select></label><button className="primary" onClick={addCatalogFood}>Añadir al diario</button></article>}
        <div className="notice"><strong>Coincidencia de referencia</strong><p>Los alimentos USDA pueden describir una preparación distinta a la tuya. Revisa el nombre y la porción; la foto puede incluir aceite, salsas o ingredientes que no aparecen en el registro genérico.</p></div>
      </section>}
      {view === 'assistant' && <section className="page-section"><PageTitle eyebrow="ASISTENTE NUTRISCAN" title="Tu espacio de ideas" subtitle="Respuestas orientativas con contexto de tu perfil y diario reciente." />
        <div className="mode-tabs">{(['assistant', 'recipe', 'plan'] as AssistantMode[]).map(mode => <button className={assistantMode === mode ? 'selected-tab' : ''} key={mode} onClick={() => { setAssistantMode(mode); setMessages([]); loadChat(mode) }}>{mode === 'assistant' ? 'Preguntar' : mode === 'recipe' ? 'Crear receta' : 'Plan de comidas'}</button>)}</div>
        <div className="card chat-card"><div className="chat-messages">{messages.length === 0 && <div className="chat-welcome"><div className="upload">✳</div><h2>{assistantMode === 'assistant' ? '¿Qué te gustaría saber?' : assistantMode === 'recipe' ? '¿Qué preparamos?' : 'Organicemos tus comidas'}</h2><p>{assistantMode === 'assistant' ? 'Pregunta sobre hábitos, porciones o tus objetivos.' : assistantMode === 'recipe' ? 'Dime qué ingredientes tienes o qué tipo de receta buscas.' : 'Pide un ejemplo de día de comidas adaptado a tus preferencias.'}</p></div>}{messages.map((item, index) => <div key={index} className={`chat-bubble ${item.role}`}>{item.content}</div>)}</div>
          <form className="chat-input" onSubmit={sendMessage}><textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Escribe tu pregunta…" maxLength={3000} /><button className="primary" disabled={busy || !message.trim()}>{busy ? 'Pensando…' : 'Enviar'}</button></form></div><div className="notice"><strong>Orientación general</strong><p>El asistente no diagnostica ni reemplaza a un profesional. No compartas información médica sensible.</p></div>
      </section>}
      {view === 'profile' && <section className="page-section"><PageTitle eyebrow="PERSONALIZACIÓN" title="Tu perfil" subtitle="Solo se usa para contextualizar tus ideas de comidas. Completa los campos que quieras." />
        <form className="card profile-form" onSubmit={saveProfile}><div className="form-grid">
          <ProfileInput label="Edad" field="age" profile={profile} setProfile={setProfile} type="number" /><ProfileInput label="Sexo o datos fisiológicos relevantes" field="sex" profile={profile} setProfile={setProfile} />
          <ProfileInput label="Altura (cm)" field="height_cm" profile={profile} setProfile={setProfile} type="number" /><ProfileInput label="Peso actual (kg)" field="current_weight_kg" profile={profile} setProfile={setProfile} type="number" />
          <ProfileInput label="Peso objetivo (kg)" field="target_weight_kg" profile={profile} setProfile={setProfile} type="number" />
          <ProfileSelect label="Actividad" field="activity_level" choices={['sedentario', 'ligero', 'moderado', 'alto']} profile={profile} setProfile={setProfile} />
          <ProfileSelect label="Objetivo principal" field="goal" choices={['perder grasa', 'ganar masa muscular', 'aumentar peso', 'mantener peso', 'rendimiento deportivo', 'mejorar hábitos']} profile={profile} setProfile={setProfile} />
          <ProfileSelect label="Tipo de alimentación" field="diet_type" choices={['omnívora', 'vegetariana', 'vegana', 'pescetariana', 'otra']} profile={profile} setProfile={setProfile} />
          <ProfileInput label="Preferencias alimentarias" field="food_preferences" profile={profile} setProfile={setProfile} /><ProfileInput label="Alergias e intolerancias" field="allergies" profile={profile} setProfile={setProfile} />
          <ProfileInput label="Alimentos que no consumes" field="excluded_foods" profile={profile} setProfile={setProfile} /><ProfileInput label="Presupuesto aproximado" field="budget" profile={profile} setProfile={setProfile} />
        </div><button className="primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar perfil'}</button></form>
      </section>}
      <div className="integration"><b>i</b> Las estimaciones de NutriScan son orientativas y no sustituyen la valoración de profesionales de salud.</div>
      <nav className="mobile-nav">{nav.map(([key, icon, label]) => <button key={key} className={view === key ? 'on' : ''} onClick={() => { setView(key); setError(''); setNotice('') }}>{icon}<small>{label}</small></button>)}</nav>
    </main>
  </div>
}

const nutrientLabel: Record<string, string> = { calories: 'kcal', protein_g: 'proteína g', carbs_g: 'carbohidratos g', fat_g: 'grasa g', saturated_fat_g: 'sat. g', fiber_g: 'fibra g', sugar_g: 'azúcar g', sodium_mg: 'sodio mg' }
function PageTitle({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) { return <div className="page-title"><small>{eyebrow}</small><h1>{title}</h1><p>{subtitle}</p></div> }
function NutrientTotals({ items, compact = false }: { items: FoodItem[]; compact?: boolean }) { return <div className={`totals ${compact ? 'compact' : ''}`}><div><b>{show(sum(items, 'calories'))}</b><small>kcal</small></div><div><b>{show(sum(items, 'protein_g'), 1)} g</b><small>proteína</small></div><div><b>{show(sum(items, 'carbs_g'), 1)} g</b><small>carbohidratos</small></div><div><b>{show(sum(items, 'fat_g'), 1)} g</b><small>grasas</small></div></div> }
function FoodCard({ item, index, onChange }: { item: FoodItem; index: number; onChange: (index: number, value: string) => void }) { return <div className="food-item"><div className="food-top"><strong>{item.name}</strong><small>{Math.round(item.confidence * 100)}% confianza</small></div><p>{item.reference_name ? `Referencia: ${item.reference_name}` : item.portion}</p><label className="grams-edit">Cantidad estimada<input type="number" min="1" max="3000" value={Math.round(item.grams)} onChange={e => onChange(index, e.target.value)} /> g</label><small>{show(item.calories)} kcal · P {show(item.protein_g, 1)} g · C {show(item.carbs_g, 1)} g · G {show(item.fat_g, 1)} g</small><small>Sat. {show(item.saturated_fat_g, 1)} g · fibra {show(item.fiber_g, 1)} g · azúcar {show(item.sugar_g, 1)} g · sodio {show(item.sodium_mg)} mg</small><small className="source-label">Fuente: {item.source || 'estimación IA'}</small></div> }
function ProfileInput({ label, field, profile, setProfile, type = 'text' }: { label: string; field: string; profile: Profile; setProfile: (value: Profile) => void; type?: string }) { return <label className="form-label">{label}<input type={type} value={String(profile[field] ?? '')} onChange={e => setProfile({ ...profile, [field]: e.target.value })} /></label> }
function ProfileSelect({ label, field, choices, profile, setProfile }: { label: string; field: string; choices: string[]; profile: Profile; setProfile: (value: Profile) => void }) { return <label className="form-label">{label}<select value={String(profile[field] || choices[0])} onChange={e => setProfile({ ...profile, [field]: e.target.value })}>{choices.map(value => <option key={value}>{value}</option>)}</select></label> }

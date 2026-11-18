// Tipos de las tablas de Supabase (escritos a mano a partir de supabase/migrations).

export type Rol = 'admin' | 'supervisor'

export interface Perfil {
  user_id: string
  nombre: string
  rol: Rol
  id_supervisor: number | null
  activo: boolean
  debe_cambiar_clave: boolean
}

export interface Supervisor { id_supervisor: number; nombre: string; activo: boolean }
export interface Agente { id_agente: number; usuario: string; nombre: string | null; id_supervisor: number | null; activo: boolean }

export interface AccionMora {
  id_accion: string
  nombre_corto: string
  titulo: string
  descripcion: string
  color: string
  orden: number
}

export interface RazonMora { id_razon: number; nombre: string; id_accion: string | null; orden: number }

export interface Periodo {
  id_periodo: number
  anio: number
  mes: number
  estado: 'cargando' | 'listo'
  archivo_gestiones: string | null
  filas_gestiones: number
  creado_en: string
}

export type TipoRegla = 'palabras' | 'razon_distinta' | 'razon_no_registrada' | 'contacto_sin_razon' | 'llamadas_dia' | 'promesas_mes' | 'codigos_resultado'

export interface AlertaRegla {
  id_regla: number
  bit: number
  nombre: string
  prioridad: 1 | 2 | 3
  tipo: TipoRegla
  patron: string | null
  razones_disparan: string[]
  umbral: number | null
  activa: boolean
  orden: number
}

export interface AlertaCategoria { id_categoria: number; nombre: string; patron: string; razones_compatibles: string[]; activa: boolean }
export interface AlertaPatron { clave: 'no_contesta' | 'rdm' | 'promesa'; descripcion: string; patron: string }

export type TramoCriterio = 'grave' | 'mejora' | 'minimo' | 'sobresaliente' | 'extraordinario'
export interface CriterioEvaluacion { id_criterio: number; tramo: TramoCriterio; descripcion: string; orden: number; activo: boolean }

export interface Monitoreo {
  id_monitoreo: number
  id_gestion: number | null
  id_periodo: number
  credito: string
  id_agente: number
  id_supervisor: number
  estado: 'escuchada' | 'evaluada'
  puntaje: number | null
  criterios_fallados: number[]
  criterios_cumplidos: number[]
  fortalezas: string | null
  oportunidades: string | null
  compromiso: string | null
  retro_dada_en: string | null
  creado_por: string
  creado_en: string
  actualizado_en: string
}

/** Gestión tal como la usa el dashboard (sin comentario, para que la descarga sea liviana). */
export interface GestionLigera {
  id_gestion: number
  credito: string
  cliente: string | null
  saldo: number | null
  codigo_accion: string | null
  codigo_resultado: string | null
  id_agente: number | null
  fecha_actividad: string | null
  id_razon: number | null
  id_supervisor: number
  tipo_credito: string | null
  cartera: 'Legal' | 'Administrativa'
  es_contacto: boolean
  alerta_mask: number
  alerta_prioridad: number
}

export interface GestionDetalle extends GestionLigera {
  comentario: string | null
  fecha_promesa: string | null
  monto_promesa: number | null
  razon_original: string | null
  alerta_notas: string | null
  unidad: string | null
}

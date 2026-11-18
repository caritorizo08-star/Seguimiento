-- Reglas por código de resultado: toda promesa y todo mensaje con tercero se marcan para escuchar.
-- Los códigos van en "patron", separados por coma.
alter table public.alerta_reglas drop constraint ck_alerta_reglas_tipo;
alter table public.alerta_reglas add constraint ck_alerta_reglas_tipo
  check (tipo in ('palabras', 'razon_distinta', 'razon_no_registrada', 'contacto_sin_razon', 'llamadas_dia', 'promesas_mes', 'codigos_resultado'));

insert into public.alerta_reglas (bit, nombre, prioridad, tipo, patron, orden) values
  (512,  'Promesa de pago (escuchar todas)', 1, 'codigos_resultado', 'PRP, PRL, PPP, PPL', 10),
  (1024, 'Mensaje con tercero (escuchar todos)', 1, 'codigos_resultado', 'DMT', 11)
on conflict (bit) do nothing;

-- Aplicar a los meses ya cargados (equivale a «Recalcular alertas» para estas dos reglas)
update public.gestiones set alerta_mask = alerta_mask | 512,  alerta_prioridad = greatest(alerta_prioridad, 1)
  where upper(codigo_resultado) in ('PRP', 'PRL', 'PPP', 'PPL');
update public.gestiones set alerta_mask = alerta_mask | 1024, alerta_prioridad = greatest(alerta_prioridad, 1)
  where upper(codigo_resultado) = 'DMT';

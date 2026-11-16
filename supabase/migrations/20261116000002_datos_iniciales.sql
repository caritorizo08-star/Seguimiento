-- =====================================================================
-- Datos iniciales: acciones, razones de mora, reglas de alertas y
-- criterios de evaluación de llamadas.
-- Origen: dashboard "Razones de mora por supervisor.html" (reglas AL_T,
-- AL_RX, AL_CAT, ACCIONES) y "Criterios para puntuacion evaluacion de
-- coaching actualizado.pptx".
-- =====================================================================

insert into public.acciones_mora (id_accion, nombre_corto, titulo, descripcion, color, orden) values
  ('arreglo',   'Arreglo de pago',   'Ofrecer arreglo de pago o reestructura',              'Quiere pagar pero el ingreso o los gastos no le alcanzan. Proponer cuota ajustada, más plazo o reestructura.', '#4B9D45', 1),
  ('salario',   'Promesa en cobro',  'Promesa de pago atada a su fecha de cobro',           'El pago depende de cuándo le pagan. Agendar la promesa para el día de cobro y llamar ese mismo día.',          '#00A4E0', 2),
  ('localizar', 'Localizar titular', 'Contactar al titular, fiador o un familiar',          'El cliente no está o dice que no es suyo. Validar quién es el titular y contactar al fiador o referencias.',   '#F5821F', 3),
  ('estado',    'Estado de cuenta',  'Enviar estado de cuenta y aclarar la deuda',          'Cree que ya pagó o canceló. Enviar el estado de cuenta y explicar el saldo pendiente antes de pedir el pago.', '#93BF02', 4),
  ('intensiva', 'Gestión intensiva', 'Gestión intensiva: visita en campo o escalar a Legal', 'No muestra interés en pagar. Subir la presión: visita, carta de cobro o traslado a cobro legal.',             '#D64545', 5),
  ('especial',  'Casos especiales',  'Atención especial y revisión con Legal',              'Caso sensible o con trámite legal. Contactar con empatía y validar con Legal antes de insistir.',             '#06255B', 6),
  ('sinrazon',  'Sin razón',         'Volver a llamar para identificar la razón',           'La gestión quedó sin razón de mora. Insistir en la llamada para saber por qué no paga.',                       '#8A93A3', 7);

insert into public.razones_mora (nombre, id_accion, orden) values
  ('Atrasos de Salario',                  'salario',   1),
  ('Gastos médicos',                      'arreglo',   2),
  ('Gastos inesperados',                  'arreglo',   3),
  ('Reducción de Ingresos Temporal',      'arreglo',   4),
  ('Desinterés',                          'intensiva', 5),
  ('Desempleo',                           'arreglo',   6),
  ('Sobreendeudamiento',                  'arreglo',   7),
  ('Reducción de Ingresos Permanente',    'arreglo',   8),
  ('Prestó Nombre',                       'localizar', 9),
  ('Muerte de Familiar',                  'especial',  10),
  ('Cambio de Trabajo',                   'salario',   11),
  ('Fuera del país',                      'localizar', 12),
  ('Creía que cuenta estaba cancelada',   'estado',    13),
  ('Incapacidad',                         'arreglo',   14),
  ('Pensión Alimenticia',                 'arreglo',   15),
  ('Gastos de divorcio',                  'arreglo',   16),
  ('Suspensión de trabajo por COVID-19',  'arreglo',   17),
  ('Embargo de Salario',                  'especial',  18),
  ('Empleado Temporal',                   'salario',   19);
-- "No especifica" no es una fila: se guarda como id_razon = null.

-- Reglas de alertas (mismas del dashboard actual; el administrador las ajusta desde la app)
insert into public.alerta_reglas (bit, nombre, prioridad, tipo, patron, razones_disparan, umbral, orden) values
  (1,   'Posible queja o tema legal',                3, 'palabras',
        'QUEJ|DENUNCI|ABOGAD|AMENAZ|ACOS[OA]|DEJEN DE LLAM|NO (LE |LA |LO )?(VUELVAN|SIGAN) (A )?LLAM|NO QUIERE QUE (LE |LA |LO )?(SIGAN |VUELVAN A )?LLAM|DEFENSA DEL CONSUM|PROTECCI.?N AL CONSUM|CONAMI|SIBOIF|SUPERINTENDEN|POLIC.?A\b|FISCAL.?A|REDES SOCIAL|DEMANDAR',
        '{}', null, 1),
  (4,   'Disputa de la deuda o de la identidad',     3, 'palabras',
        'NO RECONOCE|PREST.? (EL |SU )?NOMBRE|YA (LO |LA )?(CANCEL|PAG.? TODO)|NO DEBE NADA|SUPLANT|FRAUDE|ESTAFA|NUNCA (SAC|PID|FIRM)|NO ES SU (SALDO|DEUDA|CREDITO)',
        '{"Creía que cuenta estaba cancelada","Prestó Nombre"}', null, 2),
  (2,   'Cliente molesto o trato tenso',             2, 'palabras',
        'MOLEST|ENOJ|GROSER|INSULT|OFEND|MALCRIAD|GRIT[OAÓ]|AGRESIV|PREPOTEN|PEDANTE|MAL EDUCAD',
        '{}', null, 3),
  (8,   'Razón registrada distinta al comentario',   2, 'razon_distinta',      null, '{}', null, 4),
  (16,  'Razón en el comentario pero no registrada', 2, 'razon_no_registrada', null, '{}', null, 5),
  (64,  'Cliente se niega a pagar',                  2, 'palabras',
        'NO (VA A|PIENSA|QUIERE|DESEA) PAGAR|SE NIEGA|NIEGA (A )?PAGAR|NO PAGAR.? NADA|NO LE INTERESA PAGAR',
        '{}', null, 6),
  (128, 'Muchas llamadas el mismo día',              2, 'llamadas_dia',        null, '{}', 4, 7),
  (32,  'Contacto sin razón de mora',                1, 'contacto_sin_razon',  null, '{}', null, 8),
  (256, 'Promesas repetidas en el mes',              1, 'promesas_mes',        null, '{}', 4, 9);

insert into public.alerta_categorias (nombre, patron, razones_compatibles) values
  ('Desempleo',
   'SIN (EMPLEO|TRABAJO|LABORAR)|DESEMPLE|DESPID|CORRIERON|LIQUIDAR|NO (ESTA|EST) (TRABAJANDO|LABORANDO)|PERDI.? (EL |SU )?(EMPLEO|TRABAJO)',
   '{"Desempleo","Cambio de Trabajo","Reducción de Ingresos Temporal","Reducción de Ingresos Permanente","Empleado Temporal"}'),
  ('Gastos médicos',
   'ENFERM|HOSPITAL|CIRUG|OPERAD[OA]|OPERACI|CANCER|DI.?LISIS|ACCIDENT|INCAPACI|INTERNAD|QUIMIO|GASTOS M.?DICOS',
   '{"Gastos médicos","Incapacidad","Gastos inesperados","Muerte de Familiar"}'),
  ('Muerte de Familiar',
   'FALLEC|MURI[OÓ]|DIFUNT|SEPELIO|VELORIO',
   '{"Muerte de Familiar","Gastos inesperados","Gastos médicos"}'),
  ('Atrasos de Salario',
   'NO (LE |LES )?HAN PAGADO|NO LE PAGAN|AUN NO LE PAGAN|PAGAN TARDE|ATRASOS? DE SALARIO|SALARIO ATRAS|NO (LE )?HAN DEPOSITADO|RETRASO.{0,8}SALARIO',
   '{"Atrasos de Salario"}');

insert into public.alerta_patrones (clave, descripcion, patron) values
  ('no_contesta', 'El comentario indica que no hubo contacto (no contestó, buzón, apagado...)',
   '\bNC\b|NO CONTEST|\bBZN?\b|BUZ.?N|NO ENLAZ|APAGAD|NO RESPONDE|FUERA DE SERVICIO|NO EXISTE'),
  ('rdm', 'El comentario anota una razón de mora con RDM/RDI',
   '\bRD[MI]\s*[:.]\s*(?!NOE\b|NO ESP|N\/?E\b|NE\b|NO APLICA)[A-Z]'),
  ('promesa', 'El comentario registra una promesa o postergación de pago',
   '^\(?\s*(PRP|PPP|PRL)\b|PROMESA DE PAGO|POSTERGACI');

-- Criterios de evaluación (presentación "Criterios para puntuar una llamada")
insert into public.criterios_evaluacion (tramo, descripcion, orden) values
  ('grave', 'No negocia acuerdo de pago por saldo mínimo (no propone tractos o plazos sin descuento)', 1),
  ('grave', 'No pide el pago del mínimo para hoy o mañana (urgencia y anclaje en el mínimo)', 2),
  ('grave', 'No usa la cascada de negociación o la usa en desorden; se va al beneficio más agresivo sin proponer arreglo', 3),
  ('grave', 'No hace pausas estratégicas entre cada propuesta', 4),
  ('grave', 'Tono confrontativo o amenazas al cliente', 5),
  ('grave', 'Mal análisis previo de la cuenta: no conoce saldo total, vencido, mínimo, cuota, acuerdos, promesas, último contacto o último pago', 6),
  ('grave', 'Argumentos innecesarios o comentarios fuera de lugar que confunden al cliente', 7),
  ('grave', 'No confirma el acuerdo de pago', 8),
  ('mejora', 'No verifica toda la información de contacto ni actualiza la fecha de verificación (cada 1–2 meses)', 9),
  ('mejora', 'No usa el script correcto o lo dice en desorden', 10),
  ('mejora', 'No informa que la llamada está siendo grabada', 11),
  ('mejora', 'Saludo casual o muletillas', 12),
  ('mejora', 'No actualiza la nota permanente con información relevante (salario, fechas de pago, empleador, otros ingresos)', 13),
  ('mejora', 'Llamada extensa o sin control de la llamada', 14),
  ('mejora', 'Nota de gestión extensa, copiada de la anterior, con información repetida o sin el número de contacto correcto', 15),
  ('mejora', 'Mal uso de códigos de acción y resultado', 16),
  ('mejora', 'No dice el script educativo ni certifica el acuerdo de pago', 17),
  ('minimo', 'Usa el script correcto', 18),
  ('minimo', 'Solicita el pago mínimo hoy o mañana con sentido de urgencia', 19),
  ('minimo', 'Usa bien la cascada de negociación, con pausas estratégicas', 20),
  ('minimo', 'Usa las herramientas como gancho para adelantar un pago de buena fe', 21),
  ('minimo', 'Sondea y cuantifica la razón de mora', 22),
  ('minimo', 'Cierra acuerdo por pago mínimo (vencido + cuota actual) y lo certifica', 23),
  ('minimo', 'Recuerda los puntos de pago y se despide', 24),
  ('minimo', 'Nota de gestión precisa, nota permanente actualizada y códigos correctos', 25),
  ('sobresaliente', 'Buen tono y vocalización, sin muletillas', 26),
  ('sobresaliente', 'Reacciona positivamente a situaciones complejas y controla la llamada', 27),
  ('sobresaliente', 'Aborda la llamada de manera positiva', 28),
  ('extraordinario', 'Maneja objeciones con iniciativa y soluciones efectivas', 29),
  ('extraordinario', 'Lidera la llamada de forma estratégica, natural y profesional, y genera confianza', 30),
  ('extraordinario', 'Gestión completa, sin errores ni necesidad de intervención del supervisor', 31);

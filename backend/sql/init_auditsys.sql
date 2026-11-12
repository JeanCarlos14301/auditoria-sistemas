-- =============================================================================
-- AuditA - Esquema DDL y Seeder
-- Marco: ISO/IEC 27002:2022 + ISO 19011:2018
-- Motor: PostgreSQL 16
-- =============================================================================

BEGIN;

CREATE TABLE usuario (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    rol VARCHAR(20) NOT NULL DEFAULT 'auditor',
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_usuario_rol CHECK (rol IN ('admin', 'auditor'))
);

CREATE TABLE auditoria (
    id SERIAL PRIMARY KEY,
    organizacion VARCHAR(180) NOT NULL,
    alcance TEXT NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    id_auditor INTEGER NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
    estado VARCHAR(25) NOT NULL DEFAULT 'BORRADOR',
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_auditoria_estado CHECK (estado IN ('BORRADOR', 'EN_EJECUCION', 'EN_REVISION', 'CERRADA')),
    CONSTRAINT chk_auditoria_fechas CHECK (fecha_fin >= fecha_inicio)
);

CREATE TABLE control (
    id SERIAL PRIMARY KEY,
    codigo_iso VARCHAR(10) NOT NULL UNIQUE,
    clausula INTEGER NOT NULL,
    categoria_tema VARCHAR(60) NOT NULL,
    nombre VARCHAR(180) NOT NULL,
    criterio_evaluacion TEXT NOT NULL,
    ejemplo_evidencia TEXT NOT NULL,
    attr_tipo_control VARCHAR(100) NOT NULL,
    attr_propiedades_cia VARCHAR(120) NOT NULL,
    attr_concepto_nist VARCHAR(150) NOT NULL,
    attr_capacidad_operativa VARCHAR(120) NOT NULL,
    attr_dominio_seguridad VARCHAR(120) NOT NULL,
    CONSTRAINT chk_control_clausula CHECK (clausula IN (5, 6, 7, 8))
);

CREATE TABLE evaluacion_control (
    id SERIAL PRIMARY KEY,
    id_auditoria INTEGER NOT NULL REFERENCES auditoria(id) ON DELETE CASCADE,
    id_control INTEGER NOT NULL REFERENCES control(id) ON DELETE RESTRICT,
    estado VARCHAR(30) NOT NULL DEFAULT 'NO_IMPLEMENTADO',
    observaciones TEXT,
    justificacion_na TEXT,
    evaluado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_auditoria_control UNIQUE (id_auditoria, id_control),
    CONSTRAINT chk_eval_estado CHECK (estado IN ('IMPLEMENTADO', 'PARCIALMENTE_IMPLEMENTADO', 'NO_IMPLEMENTADO', 'NO_APLICABLE')),
    CONSTRAINT chk_eval_justificacion_na CHECK (
        estado <> 'NO_APLICABLE' OR (justificacion_na IS NOT NULL AND LENGTH(TRIM(justificacion_na)) > 0)
    ),
    CONSTRAINT chk_eval_observaciones_parcial CHECK (
        estado <> 'PARCIALMENTE_IMPLEMENTADO' OR (observaciones IS NOT NULL AND LENGTH(TRIM(observaciones)) > 0)
    )
);

CREATE TABLE evidencia (
    id SERIAL PRIMARY KEY,
    id_evaluacion_control INTEGER NOT NULL REFERENCES evaluacion_control(id) ON DELETE CASCADE,
    descripcion TEXT NOT NULL,
    fuente VARCHAR(30) NOT NULL,
    fecha_recoleccion DATE NOT NULL DEFAULT CURRENT_DATE,
    referencia_archivo VARCHAR(500),
    checksum_sha256 VARCHAR(64),
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_evidencia_fuente CHECK (fuente IN ('DOCUMENTAL', 'ENTREVISTA', 'OBSERVACION_TECNICA'))
);

CREATE TABLE hallazgo (
    id SERIAL PRIMARY KEY,
    id_evaluacion_control INTEGER NOT NULL REFERENCES evaluacion_control(id) ON DELETE CASCADE,
    condicion TEXT NOT NULL,
    criterio TEXT NOT NULL,
    causa TEXT NOT NULL,
    efecto_riesgo TEXT NOT NULL,
    severidad VARCHAR(15) NOT NULL,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_hallazgo_severidad CHECK (severidad IN ('ALTA', 'MEDIA', 'BAJA'))
);

CREATE TABLE recomendacion (
    id SERIAL PRIMARY KEY,
    id_hallazgo INTEGER NOT NULL REFERENCES hallazgo(id) ON DELETE CASCADE,
    descripcion TEXT NOT NULL,
    prioridad VARCHAR(15) NOT NULL,
    plazo_estimado VARCHAR(80) NOT NULL,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_recomendacion_prioridad CHECK (prioridad IN ('ALTA', 'MEDIA', 'BAJA'))
);

CREATE TABLE informe (
    id SERIAL PRIMARY KEY,
    id_auditoria INTEGER NOT NULL UNIQUE REFERENCES auditoria(id) ON DELETE RESTRICT,
    version VARCHAR(20) NOT NULL DEFAULT '1.0',
    cumplimiento_pct NUMERIC(5,2) NOT NULL,
    total_implementados INTEGER NOT NULL,
    total_aplicables INTEGER NOT NULL,
    total_no_aplicables INTEGER NOT NULL,
    snapshot_json JSONB NOT NULL,
    hash_integridad VARCHAR(64) NOT NULL,
    fecha_generacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE bitacora_hash_chain (
    id SERIAL PRIMARY KEY,
    id_auditoria INTEGER NOT NULL REFERENCES auditoria(id) ON DELETE RESTRICT,
    id_usuario INTEGER NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
    tipo_evento VARCHAR(50) NOT NULL,
    payload_canonico TEXT NOT NULL,
    hash_anterior VARCHAR(64) NOT NULL,
    hash_actual VARCHAR(64) NOT NULL UNIQUE,
    timestamp_utc TEXT NOT NULL
);

CREATE OR REPLACE FUNCTION fn_bloquear_alteracion_bitacora()
RETURNS TRIGGER AS $$ BEGIN RAISE EXCEPTION 'VIOLACIÓN DE INTEGRIDAD FORENSE: Los registros de bitacora_hash_chain son inmutables (Append-Only).'; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_inmutabilidad_hash_chain
BEFORE UPDATE OR DELETE ON bitacora_hash_chain
FOR EACH ROW EXECUTE FUNCTION fn_bloquear_alteracion_bitacora();

INSERT INTO control (
    codigo_iso, clausula, categoria_tema, nombre, criterio_evaluacion, ejemplo_evidencia,
    attr_tipo_control, attr_propiedades_cia, attr_concepto_nist, attr_capacidad_operativa, attr_dominio_seguridad
) VALUES
('5.1', 5, 'Organizacionales', 'Políticas para la seguridad de la información', '¿La organización dispone de un conjunto de políticas de seguridad aprobadas, vigentes, publicadas y comunicadas sistemáticamente a la totalidad del personal y partes interesadas relevantes?', 'Documento maestro de política con control de versiones, acta formal de aprobación firmada por el comité directivo, y registros en bitácoras de notificaciones masivas de correo electrónico confirmando la distribución al personal.', 'Preventivo', 'Confidencialidad, Integridad, Disponibilidad', 'Proteger', 'Gobernanza', 'Gobernanza y ecosistema'),
('5.15', 5, 'Organizacionales', 'Control de acceso', '¿Existen reglas formalizadas a nivel organizacional para regular y restringir de manera granular el acceso físico y lógico a la información, basadas estrictamente en las necesidades del negocio y la seguridad?', 'Matriz documentada de control de acceso basada en roles (RBAC) relacionando cargos contra aplicaciones, y política formal de restricciones de acceso.', 'Preventivo', 'Confidencialidad, Integridad', 'Proteger', 'Identidad y accesos', 'Protección'),
('5.18', 5, 'Organizacionales', 'Derechos de acceso', '¿El ciclo de vida del acceso se administra garantizando que la provisión, revisión, modificación periódica y retiro inmediato de privilegios se ejecute según procedimientos estandarizados?', 'Trazabilidad de tickets en sistemas de Mesa de Ayuda (Help Desk) documentando el ciclo de Altas, Bajas y Modificaciones (ABM), y evidencia documental de procesos de recertificación trimestral de cuentas.', 'Preventivo', 'Confidencialidad, Integridad', 'Proteger', 'Identidad y accesos', 'Protección'),
('5.24', 5, 'Organizacionales', 'Planificación y preparación de la gestión de incidentes', '¿La organización ha estructurado previamente procedimientos operativos, canales de comunicación y responsabilidades claras para reportar, escalar y responder ante eventos de ciberseguridad?', 'Existencia de Planes de Respuesta a Incidentes (Playbooks), actas de designación formal del Equipo de Respuesta a Emergencias Cibernéticas (CSIRT/CERT), y plataforma de ticketing configurada.', 'Correctivo', 'Confidencialidad, Integridad, Disponibilidad', 'Responder', 'Gestión de eventos', 'Resiliencia'),
('6.3', 6, 'Personas', 'Concienciación, educación y capacitación', '¿El personal recibe formación pertinente y periódica en concientización sobre amenazas de ciberseguridad y políticas internas, reforzando sus conocimientos en intervalos definidos?', 'Planes curriculares anuales, registros documentales de inducción, listas de asistencia y plataformas de telemetría reportando los índices de resiliencia frente a simulacros controlados de suplantación de identidad (Phishing).', 'Preventivo', 'Confidencialidad, Integridad, Disponibilidad', 'Proteger', 'Seguridad de RR.HH.', 'Defensa'),
('7.2', 7, 'Físicos', 'Entrada física', '¿Las instalaciones corporativas y las áreas seguras de procesamiento de información cuentan con perímetros reforzados, protegidos por controles de entrada y registros de acceso inquebrantables?', 'Bitácoras electrónicas extraídas directamente del servidor de control de acceso por tarjetas inteligentes RFID o lectoras biométricas, acompañadas de registros fotográficos de torniquetes y puertas con cierre magnético.', 'Preventivo', 'Confidencialidad, Integridad, Disponibilidad', 'Proteger', 'Seguridad física', 'Protección'),
('7.4', 7, 'Físicos', 'Monitoreo de seguridad física', '¿Las instalaciones operativas están sometidas a vigilancia y telemetría continua para disuadir intentos de intrusión y posibilitar la detección temprana de accesos no autorizados?', 'Evidencia de instalación de sistemas de Circuito Cerrado de Televisión (CCTV), diagramas de cobertura de cámaras, registros de tiempo de retención de DVR/NVR y bitácoras de monitoreo por personal de seguridad.', 'Detectivo', 'Confidencialidad, Integridad, Disponibilidad', 'Detectar', 'Seguridad física', 'Defensa'),
('8.5', 8, 'Tecnológicos', 'Autenticación segura', '¿Se han implementado tecnologías y protocolos sólidos de autenticación, acordes a la severidad del riesgo evaluado, para proteger el ingreso a los sistemas organizacionales?', 'Capturas de pantalla o extractos de políticas de grupo (GPO) del Directorio Activo (Active Directory) demostrando la imposición de contraseñas complejas, y configuración del requerimiento de Autenticación Multifactor (MFA) para plataformas externas.', 'Preventivo', 'Confidencialidad, Integridad', 'Proteger', 'Identidad y accesos', 'Protección'),
('8.7', 8, 'Tecnológicos', 'Protección contra el malware', '¿La red corporativa y los dispositivos de usuario final cuentan con agentes técnicos de seguridad para detectar, aislar y recuperar información ante la ejecución de código malicioso?', 'Consola unificada de gestión del software Endpoint Detection and Response (EDR) evidenciando una cobertura total en los servidores, con las firmas y bases de datos heurísticas actualizadas y en modo bloqueante.', 'Preventivo, Detectivo, Correctivo', 'Confidencialidad, Integridad, Disponibilidad', 'Proteger, Detectar, Recuperar', 'Seguridad de sistemas', 'Defensa'),
('8.8', 8, 'Tecnológicos', 'Gestión de vulnerabilidades técnicas', '¿La organización implementa rutinas automatizadas para obtener, clasificar y priorizar información sobre vulnerabilidades técnicas en sus sistemas, aplicando los remedios (parches) correspondientes?', 'Exportaciones en PDF de herramientas automatizadas de escaneo de vulnerabilidades (ej. Nessus, OpenVAS, Qualys) categorizando hallazgos por severidad (CVSS), y actas formales de ejecución de ventanas de mantenimiento de parchado.', 'Preventivo', 'Confidencialidad, Integridad, Disponibilidad', 'Identificar, Proteger', 'Gestión de amenazas', 'Protección'),
('8.12', 8, 'Tecnológicos', 'Prevención de fuga de datos (DLP)', '¿Las plataformas de procesamiento y almacenamiento están dotadas con tecnología que previene, detecta y bloquea la transferencia no autorizada o exfiltración accidental de información clasificada como confidencial?', 'Extractos de configuración de reglas y políticas heurísticas en soluciones DLP (Data Loss Prevention) aplicadas en correo electrónico (bloqueo de envío masivo de tarjetas de crédito) y control de dispositivos finales (bloqueo de almacenamiento masivo USB).', 'Preventivo, Detectivo', 'Confidencialidad', 'Proteger, Detectar', 'Protección de información', 'Protección'),
('8.13', 8, 'Tecnológicos', 'Copias de seguridad de la información', '¿Se ejecutan periódicamente y con base en políticas formalizadas copias de respaldo de sistemas críticos y datos, probando metódicamente la capacidad de restauración funcional frente a eventuales desastres?', 'Archivos de log del software de respaldo (ej. Veeam, Bacula), cronogramas de retención de datos, evidencia fotográfica o técnica de almacenamiento fuera de línea (Air-Gapped), e informes documentados de simulacros exitosos de recuperación total (Disaster Recovery).', 'Correctivo', 'Disponibilidad', 'Recuperar', 'Continuidad', 'Resiliencia'),
('8.15', 8, 'Tecnológicos', 'Registro de eventos (Logging)', '¿Se producen de manera estandarizada, se protegen criptográficamente contra alteraciones, y se analizan rutinariamente los registros de actividades operacionales, anomalías de red y fallos de seguridad de todos los sistemas relevantes?', 'Interfaz gráfica y perfiles de ingesta de datos de un sistema centralizado de gestión de eventos (SIEM o Syslog) demostrando la centralización de logs de firewalls, servidores de bases de datos y controladores de dominio, con alertas programadas para anomalías.', 'Detectivo', 'Confidencialidad, Integridad', 'Detectar', 'Gestión de eventos', 'Defensa'),
('8.23', 8, 'Tecnológicos', 'Filtrado web', '¿El acceso a la red pública de internet mediante los dispositivos y pasarelas de la organización está sometido a una gestión técnica que reduce proactivamente la exposición a dominios web que alojan contenido malicioso o ilegítimo?', 'Visualización y exportación de la lista de control de acceso (ACL) y las reglas de filtrado URL configuradas en el Firewall Perimetral, el Proxy Corporativo o agentes DNS, evidenciando categorías de dominios restringidos y reportes de tráfico bloqueado.', 'Preventivo', 'Confidencialidad, Integridad', 'Proteger', 'Seguridad de redes', 'Protección');

-- =============================================================================
-- Endurecimiento adicional (no altera las 9 tablas ni sus columnas)
-- =============================================================================

-- TRUNCATE no dispara triggers FOR EACH ROW: se bloquea con un trigger de sentencia.
CREATE TRIGGER trg_inmutabilidad_hash_chain_truncate
BEFORE TRUNCATE ON bitacora_hash_chain
FOR EACH STATEMENT EXECUTE FUNCTION fn_bloquear_alteracion_bitacora();

-- Índices sobre claves foráneas (PostgreSQL no los crea automáticamente).
CREATE INDEX idx_auditoria_id_auditor ON auditoria (id_auditor);
CREATE INDEX idx_eval_id_control ON evaluacion_control (id_control);
CREATE INDEX idx_evidencia_id_eval ON evidencia (id_evaluacion_control);
CREATE INDEX idx_hallazgo_id_eval ON hallazgo (id_evaluacion_control);
CREATE INDEX idx_recomendacion_id_hallazgo ON recomendacion (id_hallazgo);
CREATE INDEX idx_bitacora_id_usuario ON bitacora_hash_chain (id_usuario);
-- Recorrido ordenado de la cadena por auditoría (último eslabón y verificación).
CREATE INDEX idx_bitacora_auditoria_id ON bitacora_hash_chain (id_auditoria, id);

COMMIT;

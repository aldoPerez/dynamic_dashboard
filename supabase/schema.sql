-- ============================================================
-- SCHEMA COMPLETO v2 — Sistema de Ventas en Tiempo Real
-- 
-- Ejecutar UNA SOLA VEZ en Supabase SQL Editor
-- Copiar TODO el contenido y dar Run
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── TABLAS ────────────────────────────────────────────────────────────────────

CREATE TABLE branches (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id     TEXT        NOT NULL UNIQUE,
  name          TEXT        NOT NULL,
  db_type       TEXT        NOT NULL DEFAULT 'sqlserver'
                            CHECK (db_type IN ('sqlserver','mysql','postgresql')),
  api_key       TEXT        NOT NULL DEFAULT encode(gen_random_bytes(32),'hex'),
  active        BOOLEAN     NOT NULL DEFAULT true,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE data_types (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  key               TEXT        NOT NULL UNIQUE,
  label             TEXT        NOT NULL,
  description       TEXT,
  query_sql         TEXT,
  columns_metadata  JSONB       NOT NULL DEFAULT '[]',
  is_live           BOOLEAN     NOT NULL DEFAULT false,
  active            BOOLEAN     NOT NULL DEFAULT true,
  sort_order        INTEGER     NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE branch_data_types (
  id                    UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id             UUID    NOT NULL REFERENCES branches(id)   ON DELETE CASCADE,
  data_type_id          UUID    NOT NULL REFERENCES data_types(id) ON DELETE CASCADE,
  sync_interval_seconds INTEGER NOT NULL DEFAULT 30,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (branch_id, data_type_id)
);

CREATE TABLE branch_db_configs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id       UUID        NOT NULL REFERENCES branches(id) ON DELETE CASCADE UNIQUE,
  db_server       TEXT        NOT NULL,
  db_port         INTEGER     NOT NULL DEFAULT 1433,
  db_database     TEXT        NOT NULL,
  db_user         TEXT        NOT NULL,
  db_password_enc TEXT        NOT NULL,
  db_encrypt      BOOLEAN     NOT NULL DEFAULT false,
  db_trust_cert   BOOLEAN     NOT NULL DEFAULT true,
  tested_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE admin_users (
  id          UUID    PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT    NOT NULL,
  role        TEXT    NOT NULL DEFAULT 'viewer'
              CHECK (role IN ('superadmin','admin','viewer')),
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE branch_user_permissions (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_id   UUID    NOT NULL REFERENCES branches(id)  ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, branch_id)
);

CREATE TABLE dashboard_widgets (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  data_type_id    UUID    NOT NULL REFERENCES data_types(id) ON DELETE CASCADE,
  title           TEXT    NOT NULL,
  chart_type      TEXT    NOT NULL
                  CHECK (chart_type IN ('line','area','bar','bar_h','donut','pie','table','kpi')),
  width           TEXT    NOT NULL DEFAULT '1/3'
                  CHECK (width IN ('1/3','1/2','2/3','full')),
  x_field         TEXT,
  y_fields        JSONB   NOT NULL DEFAULT '[]',
  kpi_field       TEXT,
  kpi_prefix      TEXT    NOT NULL DEFAULT '',
  kpi_suffix      TEXT    NOT NULL DEFAULT '',
  colors          JSONB   NOT NULL DEFAULT '[]',
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE branch_dashboard_layouts (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id   UUID    NOT NULL REFERENCES branches(id)          ON DELETE CASCADE,
  widget_id   UUID    NOT NULL REFERENCES dashboard_widgets(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  visible     BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (branch_id, widget_id)
);

CREATE TABLE config_changelog (
  id          BIGSERIAL   PRIMARY KEY,
  table_name  TEXT        NOT NULL,
  operation   TEXT        NOT NULL,
  record_id   TEXT        NOT NULL,
  payload     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── TRIGGERS: updated_at ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER t_branches_upd    BEFORE UPDATE ON branches          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER t_data_types_upd  BEFORE UPDATE ON data_types        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER t_db_configs_upd  BEFORE UPDATE ON branch_db_configs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER t_admin_users_upd BEFORE UPDATE ON admin_users       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER t_widgets_upd     BEFORE UPDATE ON dashboard_widgets FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── TRIGGERS: changelog ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION log_change()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO config_changelog(table_name, operation, record_id, payload)
  VALUES (TG_TABLE_NAME, TG_OP,
    COALESCE(NEW.id::TEXT, OLD.id::TEXT),
    CASE TG_OP WHEN 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END);
  RETURN COALESCE(NEW, OLD);
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER t_branches_log AFTER INSERT OR UPDATE OR DELETE ON branches               FOR EACH ROW EXECUTE FUNCTION log_change();
CREATE TRIGGER t_dt_log       AFTER INSERT OR UPDATE OR DELETE ON data_types              FOR EACH ROW EXECUTE FUNCTION log_change();
CREATE TRIGGER t_dbc_log      AFTER INSERT OR UPDATE OR DELETE ON branch_db_configs       FOR EACH ROW EXECUTE FUNCTION log_change();
CREATE TRIGGER t_bdt_log      AFTER INSERT OR UPDATE OR DELETE ON branch_data_types       FOR EACH ROW EXECUTE FUNCTION log_change();
CREATE TRIGGER t_widgets_log  AFTER INSERT OR UPDATE OR DELETE ON dashboard_widgets       FOR EACH ROW EXECUTE FUNCTION log_change();
CREATE TRIGGER t_layouts_log  AFTER INSERT OR UPDATE OR DELETE ON branch_dashboard_layouts FOR EACH ROW EXECUTE FUNCTION log_change();

-- ── FUNCIONES ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION regenerate_branch_api_key(p_branch_id UUID)
RETURNS TEXT AS $$
DECLARE new_key TEXT;
BEGIN
  new_key := encode(gen_random_bytes(32), 'hex');
  UPDATE branches SET api_key = new_key, updated_at = NOW() WHERE id = p_branch_id;
  RETURN new_key;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM admin_users WHERE id = auth.uid() AND active = true;
$$ LANGUAGE sql SECURITY DEFINER;

-- ── VISTAS ────────────────────────────────────────────────────────────────────

CREATE VIEW branch_db_configs_safe AS
  SELECT id, branch_id, db_server, db_port, db_database,
         db_user, db_encrypt, db_trust_cert, tested_at, created_at, updated_at
  FROM branch_db_configs;

CREATE VIEW my_branches AS
  SELECT b.* FROM branches b
  INNER JOIN branch_user_permissions bup ON b.id = bup.branch_id
  WHERE bup.user_id = auth.uid() AND b.active = true;

-- ── ROW LEVEL SECURITY ────────────────────────────────────────────────────────

ALTER TABLE branches                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_types               ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_data_types        ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_db_configs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_user_permissions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_widgets        ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_dashboard_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_changelog         ENABLE ROW LEVEL SECURITY;

CREATE POLICY "br_sel" ON branches FOR SELECT TO authenticated USING (true);
CREATE POLICY "br_ins" ON branches FOR INSERT TO authenticated WITH CHECK (get_user_role() IN ('admin','superadmin'));
CREATE POLICY "br_upd" ON branches FOR UPDATE TO authenticated USING (get_user_role() IN ('admin','superadmin'));
CREATE POLICY "br_del" ON branches FOR DELETE TO authenticated USING (get_user_role() = 'superadmin');

CREATE POLICY "dt_sel" ON data_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "dt_all" ON data_types FOR ALL   TO authenticated USING (get_user_role() IN ('admin','superadmin'));

CREATE POLICY "bdt_sel" ON branch_data_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "bdt_all" ON branch_data_types FOR ALL   TO authenticated USING (get_user_role() IN ('admin','superadmin'));

CREATE POLICY "dbc_sel" ON branch_db_configs FOR SELECT TO authenticated USING (true);
CREATE POLICY "dbc_all" ON branch_db_configs FOR ALL   TO authenticated USING (get_user_role() IN ('admin','superadmin'));

CREATE POLICY "au_self"  ON admin_users FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "au_super" ON admin_users FOR ALL    TO authenticated USING (get_user_role() = 'superadmin');

CREATE POLICY "bup_sel" ON branch_user_permissions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "bup_all" ON branch_user_permissions FOR ALL    TO authenticated USING (get_user_role() IN ('admin','superadmin'));

CREATE POLICY "dw_sel" ON dashboard_widgets FOR SELECT TO authenticated USING (true);
CREATE POLICY "dw_all" ON dashboard_widgets FOR ALL   TO authenticated USING (get_user_role() IN ('admin','superadmin'));

CREATE POLICY "bdl_sel" ON branch_dashboard_layouts FOR SELECT TO authenticated
  USING (
    get_user_role() IN ('admin','superadmin')
    OR EXISTS (
      SELECT 1 FROM branch_user_permissions
      WHERE user_id = auth.uid() AND branch_id = branch_dashboard_layouts.branch_id
    )
  );
CREATE POLICY "bdl_all" ON branch_dashboard_layouts FOR ALL TO authenticated
  USING (get_user_role() IN ('admin','superadmin'));

CREATE POLICY "cl_sel" ON config_changelog FOR SELECT TO authenticated
  USING (get_user_role() IN ('admin','superadmin'));

-- ── STORAGE ───────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('releases', 'releases', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "rel_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'releases'
    AND (SELECT role FROM admin_users WHERE id = auth.uid()) IN ('admin','superadmin','viewer'));

CREATE POLICY "rel_write" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'releases'
    AND (SELECT role FROM admin_users WHERE id = auth.uid()) = 'superadmin');

-- ── DATOS INICIALES ───────────────────────────────────────────────────────────
-- Queries en sintaxis SQL Server. Si usas MySQL o PostgreSQL,
-- edítalas desde panel admin → Tipos de dato después de ejecutar este script.

INSERT INTO data_types (key, label, description, query_sql, columns_metadata, is_live, sort_order) VALUES

('resumen_ventas','Resumen de ventas','Totales del período: folios, importe, ticket promedio',
'SELECT
  COUNT(*)                  AS totalFolios,
  ISNULL(SUM(Total),0)      AS ventaTotal,
  ISNULL(SUM(Descuento),0)  AS descuentoTotal,
  ISNULL(SUM(Impuesto),0)   AS impuestoTotal,
  ISNULL(SUM(Personas),0)   AS totalComensales,
  ISNULL(AVG(Total),0)      AS ticketPromedio
FROM Folios
WHERE FechaCierre >= @dateFrom AND FechaCierre < @dateTo AND Estatus = ''C''',
'[{"key":"totalFolios","label":"Folios","type":"number"},{"key":"ventaTotal","label":"Venta Total","type":"number"},{"key":"descuentoTotal","label":"Descuentos","type":"number"},{"key":"impuestoTotal","label":"Impuestos","type":"number"},{"key":"totalComensales","label":"Comensales","type":"number"},{"key":"ticketPromedio","label":"Ticket Promedio","type":"number"}]',
false, 1),

('ventas_forma_pago','Ventas por forma de pago','Efectivo, tarjeta y otros con porcentaje',
'SELECT
  ISNULL(FormaPago,''OTROS'') AS formaPago,
  COUNT(*)                    AS totalFolios,
  ISNULL(SUM(Total),0)        AS importe,
  CAST(ISNULL(SUM(Total),0)*100.0/NULLIF((SELECT SUM(Total) FROM Folios WHERE FechaCierre>=@dateFrom AND FechaCierre<@dateTo AND Estatus=''C''),0) AS DECIMAL(5,2)) AS porcentaje
FROM Folios
WHERE FechaCierre >= @dateFrom AND FechaCierre < @dateTo AND Estatus = ''C''
GROUP BY FormaPago ORDER BY importe DESC',
'[{"key":"formaPago","label":"Forma de Pago","type":"string"},{"key":"totalFolios","label":"Folios","type":"number"},{"key":"importe","label":"Importe","type":"number"},{"key":"porcentaje","label":"Porcentaje","type":"number"}]',
false, 2),

('ventas_servicio','Ventas por servicio','Comedor, para llevar, delivery, etc.',
'SELECT
  ISNULL(TipoServicio,''COMEDOR'') AS servicio,
  COUNT(*)                         AS totalFolios,
  ISNULL(SUM(Total),0)             AS importe,
  CAST(ISNULL(SUM(Total),0)*100.0/NULLIF((SELECT SUM(Total) FROM Folios WHERE FechaCierre>=@dateFrom AND FechaCierre<@dateTo AND Estatus=''C''),0) AS DECIMAL(5,2)) AS porcentaje
FROM Folios
WHERE FechaCierre >= @dateFrom AND FechaCierre < @dateTo AND Estatus = ''C''
GROUP BY TipoServicio ORDER BY importe DESC',
'[{"key":"servicio","label":"Servicio","type":"string"},{"key":"totalFolios","label":"Folios","type":"number"},{"key":"importe","label":"Importe","type":"number"},{"key":"porcentaje","label":"Porcentaje","type":"number"}]',
false, 3),

('ventas_tipo','Ventas por tipo','Alimentos vs bebidas vs otros',
'SELECT
  ISNULL(c.Tipo,''OTROS'') AS tipo,
  ISNULL(SUM(fd.Total),0)  AS importe,
  CAST(ISNULL(SUM(fd.Total),0)*100.0/NULLIF((SELECT SUM(fd2.Total) FROM FoliosDetalle fd2 INNER JOIN Folios f2 ON fd2.Folio=f2.Folio WHERE f2.FechaCierre>=@dateFrom AND f2.FechaCierre<@dateTo AND f2.Estatus=''C''),0) AS DECIMAL(5,2)) AS porcentaje
FROM FoliosDetalle fd
INNER JOIN Folios f ON fd.Folio=f.Folio
LEFT JOIN Categorias c ON fd.Categoria=c.CategoriaID
WHERE f.FechaCierre >= @dateFrom AND f.FechaCierre < @dateTo AND f.Estatus=''C''
GROUP BY c.Tipo ORDER BY importe DESC',
'[{"key":"tipo","label":"Tipo","type":"string"},{"key":"importe","label":"Importe","type":"number"},{"key":"porcentaje","label":"%","type":"number"}]',
false, 4),

('top_productos','Top 5 productos','Los 5 productos más vendidos por importe',
'SELECT TOP 5
  fd.Clave AS clave, ISNULL(fd.Descripcion,'''') AS producto,
  SUM(fd.Cantidad) AS cantidad, ISNULL(SUM(fd.Total),0) AS importe
FROM FoliosDetalle fd
INNER JOIN Folios f ON fd.Folio=f.Folio
WHERE f.FechaCierre >= @dateFrom AND f.FechaCierre < @dateTo
  AND f.Estatus=''C'' AND ISNULL(fd.Cortesia,0)=0
GROUP BY fd.Clave, fd.Descripcion ORDER BY importe DESC',
'[{"key":"clave","label":"Clave","type":"string"},{"key":"producto","label":"Producto","type":"string"},{"key":"cantidad","label":"Cantidad","type":"number"},{"key":"importe","label":"Importe","type":"number"}]',
false, 5),

('cancelaciones','Cancelaciones','Folios cancelados agrupados por día',
'SELECT
  CAST(FechaCierre AS DATE) AS fecha,
  COUNT(*) AS totalCancelaciones,
  ISNULL(SUM(Total),0) AS importeCancelado
FROM Folios
WHERE FechaCierre >= @dateFrom AND FechaCierre < @dateTo AND Estatus=''X''
GROUP BY CAST(FechaCierre AS DATE) ORDER BY fecha ASC',
'[{"key":"fecha","label":"Fecha","type":"date"},{"key":"totalCancelaciones","label":"Cancelaciones","type":"number"},{"key":"importeCancelado","label":"Importe","type":"number"}]',
false, 6),

('tendencia_diaria','Tendencia diaria','Ventas, comensales y ticket promedio por día',
'SELECT
  CAST(FechaCierre AS DATE) AS fecha,
  COUNT(*) AS totalFolios,
  ISNULL(SUM(Total),0) AS ventaTotal,
  ISNULL(SUM(Personas),0) AS comensales,
  ISNULL(AVG(Total),0) AS ticketPromedio
FROM Folios
WHERE FechaCierre >= @dateFrom AND FechaCierre < @dateTo AND Estatus=''C''
GROUP BY CAST(FechaCierre AS DATE) ORDER BY fecha ASC',
'[{"key":"fecha","label":"Fecha","type":"date"},{"key":"totalFolios","label":"Folios","type":"number"},{"key":"ventaTotal","label":"Venta Total","type":"number"},{"key":"comensales","label":"Comensales","type":"number"},{"key":"ticketPromedio","label":"Ticket Promedio","type":"number"}]',
false, 7),

('mesas_estado','Estado de mesas','Estado actual de todas las mesas (sin rango de fechas)',
'SELECT
  Mesa AS mesa, ISNULL(Descripcion,'''') AS descripcion,
  Estatus AS estatus, ISNULL(Mesero,'''') AS mesero,
  ISNULL(Personas,0) AS personas
FROM Mesas ORDER BY Mesa',
'[{"key":"mesa","label":"Mesa","type":"string"},{"key":"descripcion","label":"Descripción","type":"string"},{"key":"estatus","label":"Estatus","type":"string"},{"key":"mesero","label":"Mesero","type":"string"},{"key":"personas","label":"Personas","type":"number"}]',
true, 8);

-- ============================================================
-- SIGUIENTE PASO DESPUÉS DE EJECUTAR ESTE SCRIPT:
--
-- 1. Supabase Dashboard → Authentication → Users → Add user
--    Crear tu usuario con email y contraseña
--    Copiar el UUID generado
--
-- 2. Ejecutar esto (reemplazar el UUID):
--    INSERT INTO admin_users (id, full_name, role)
--    VALUES ('<UUID-AQUI>', 'Tu Nombre', 'superadmin');
--
-- 3. Abrir el panel admin → iniciar sesión → crear sucursales
-- ============================================================

const BaseConnector = require('./base')
const { todayRange, merge } = require('./base')

class SoftRestauranteConnector extends BaseConnector {
  async fetchToday() {
    const { from, to } = todayRange()
    const [ventas, detalle, mesas, corte] = await Promise.all([
      this.runDataTypeQuery('ventas',  { from, to }),
      this.runDataTypeQuery('detalle', { from, to }),
      this.runDataTypeQuery('mesas',   {}),
      this.runDataTypeQuery('corte',   { from, to }),
    ])
    return { ventas: merge(ventas, detalle, 'folioId'), mesas, corteDia: corte[0] ?? {} }
  }

  async fetchRange(dateFrom, dateTo, dataTypes, abortCtrl) {
    const from = new Date(dateFrom)
    const to   = new Date(dateTo); to.setDate(to.getDate()+1)
    const result = {}
    if (this.shouldFetch(dataTypes,'ventas')) {
      this.checkCancelled(abortCtrl,'ventas')
      const ventas  = await this.runDataTypeQuery('ventas',  { from, to })
      const detalle = await this.runDataTypeQuery('detalle', { from, to })
      result.ventas = merge(ventas, detalle, 'folioId')
    }
    if (this.shouldFetch(dataTypes,'corte'))  { this.checkCancelled(abortCtrl,'corte');  result.cortePorDia = await this.runDataTypeQuery('corte_agrupado', { from, to }) }
    if (this.shouldFetch(dataTypes,'mesas'))  { this.checkCancelled(abortCtrl,'mesas');  result.mesas = await this.runDataTypeQuery('mesas', {}) }
    // Queries del dashboard
    const dashKeys = ['resumen_ventas','ventas_forma_pago','ventas_servicio','ventas_tipo','top_productos','cancelaciones','tendencia_diaria']
    for (const key of dashKeys) {
      if (this.shouldFetch(dataTypes, key)) {
        this.checkCancelled(abortCtrl, key)
        result[key] = await this.runDataTypeQuery(key, { from, to })
      }
    }
    return result
  }

  async query_ventas({ from, to }) {
    return this.query(`SELECT f.Folio AS folioId, f.FechaApertura AS fechaApertura, f.FechaCierre AS fechaCierre, f.Mesa AS mesa, f.Mesero AS mesero, ISNULL(f.Personas,0) AS personas, ISNULL(f.SubTotal,0) AS subtotal, ISNULL(f.Descuento,0) AS descuento, ISNULL(f.Impuesto,0) AS impuesto, ISNULL(f.Total,0) AS total, ISNULL(f.FormaPago,'') AS formaPago FROM Folios f WHERE f.FechaCierre >= @from AND f.FechaCierre < @to AND f.Estatus = 'C' ORDER BY f.FechaCierre DESC`, { from, to })
  }
  async query_detalle({ from, to }) {
    return this.query(`SELECT fd.Folio AS folioId, fd.Clave AS claveProducto, ISNULL(fd.Descripcion,'') AS descripcion, ISNULL(fd.Cantidad,0) AS cantidad, ISNULL(fd.PrecioUnitario,0) AS precioUnitario, ISNULL(fd.Total,0) AS total FROM FoliosDetalle fd INNER JOIN Folios f ON fd.Folio=f.Folio WHERE f.FechaCierre >= @from AND f.FechaCierre < @to AND f.Estatus='C'`, { from, to })
  }
  async query_mesas() {
    return this.query(`SELECT m.Mesa AS mesa, ISNULL(m.Descripcion,'') AS descripcion, m.Estatus AS estatus, m.Folio AS folioActivo, ISNULL(m.Mesero,'') AS mesero, m.HoraApertura AS horaApertura, ISNULL(m.Personas,0) AS personas FROM Mesas m ORDER BY m.Mesa`)
  }
  async query_corte({ from, to }) {
    return this.query(`SELECT COUNT(*) AS totalFolios, ISNULL(SUM(f.Total),0) AS ventaTotal, ISNULL(SUM(f.Descuento),0) AS descuentoTotal, ISNULL(SUM(f.Impuesto),0) AS impuestoTotal, ISNULL(AVG(f.Total),0) AS ticketPromedio FROM Folios f WHERE f.FechaCierre >= @from AND f.FechaCierre < @to AND f.Estatus='C'`, { from, to })
  }
  async query_corte_agrupado({ from, to }) {
    return this.query(`SELECT CAST(f.FechaCierre AS DATE) AS fecha, COUNT(*) AS totalFolios, ISNULL(SUM(f.Total),0) AS ventaTotal FROM Folios f WHERE f.FechaCierre >= @from AND f.FechaCierre < @to AND f.Estatus='C' GROUP BY CAST(f.FechaCierre AS DATE) ORDER BY fecha ASC`, { from, to })
  }
}

module.exports = SoftRestauranteConnector

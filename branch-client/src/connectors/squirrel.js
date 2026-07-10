const BaseConnector = require('./base')
const { todayRange, merge } = require('./base')

class SquirrelConnector extends BaseConnector {
  async fetchToday() {
    const { from, to } = todayRange()
    const [ventas, detalle, mesas, corte] = await Promise.all([
      this.runDataTypeQuery('ventas',  { from, to }),
      this.runDataTypeQuery('detalle', { from, to }),
      this.runDataTypeQuery('mesas',   {}),
      this.runDataTypeQuery('corte',   { from, to }),
    ])
    return { ventas: merge(ventas, detalle, 'transactionId'), mesas, corteDia: corte[0] ?? {} }
  }

  async fetchRange(dateFrom, dateTo, dataTypes, abortCtrl) {
    const from = new Date(dateFrom)
    const to   = new Date(dateTo); to.setDate(to.getDate()+1)
    const result = {}
    if (this.shouldFetch(dataTypes,'ventas')) {
      this.checkCancelled(abortCtrl,'ventas')
      const ventas  = await this.runDataTypeQuery('ventas',  { from, to })
      const detalle = await this.runDataTypeQuery('detalle', { from, to })
      result.ventas = merge(ventas, detalle, 'transactionId')
    }
    if (this.shouldFetch(dataTypes,'corte'))  { this.checkCancelled(abortCtrl,'corte');  result.cortePorDia = await this.runDataTypeQuery('corte_agrupado', { from, to }) }
    if (this.shouldFetch(dataTypes,'mesas'))  { this.checkCancelled(abortCtrl,'mesas');  result.mesas = await this.runDataTypeQuery('mesas', {}) }
    const dashKeys = ['resumen_ventas','ventas_forma_pago','ventas_servicio','ventas_tipo','top_productos','cancelaciones','tendencia_diaria']
    for (const key of dashKeys) {
      if (this.shouldFetch(dataTypes, key)) { this.checkCancelled(abortCtrl,key); result[key] = await this.runDataTypeQuery(key, { from, to }) }
    }
    return result
  }

  async query_ventas({ from, to }) {
    return this.query(`SELECT t.TransactionID AS transactionId, t.TransactionDate AS fechaApertura, t.CloseDate AS fechaCierre, t.TableNumber AS mesa, ISNULL(e.EmployeeName,'') AS mesero, ISNULL(t.GuestCount,0) AS personas, ISNULL(t.SubTotal,0) AS subtotal, ISNULL(t.DiscountAmount,0) AS descuento, ISNULL(t.TaxAmount,0) AS impuesto, ISNULL(t.TotalAmount,0) AS total, ISNULL(t.PaymentType,'') AS formaPago FROM Transactions t LEFT JOIN Employees e ON t.EmployeeID=e.EmployeeID WHERE t.CloseDate >= @from AND t.CloseDate < @to AND t.Status='CLOSED' ORDER BY t.CloseDate DESC`, { from, to })
  }
  async query_detalle({ from, to }) {
    return this.query(`SELECT ti.TransactionID AS transactionId, ti.ItemID AS claveProducto, ISNULL(ti.ItemName,'') AS descripcion, ISNULL(ti.Quantity,0) AS cantidad, ISNULL(ti.UnitPrice,0) AS precioUnitario, ISNULL(ti.ExtendedPrice,0) AS total FROM TransactionItems ti INNER JOIN Transactions t ON ti.TransactionID=t.TransactionID WHERE t.CloseDate >= @from AND t.CloseDate < @to AND t.Status='CLOSED'`, { from, to })
  }
  async query_mesas() {
    return this.query(`SELECT t.TableNumber AS mesa, ISNULL(t.TableName,'') AS descripcion, t.TableStatus AS estatus, t.CurrentTransactionID AS folioActivo, ISNULL(e.EmployeeName,'') AS mesero, t.OpenTime AS horaApertura, ISNULL(t.GuestCount,0) AS personas FROM Tables t LEFT JOIN Employees e ON t.CurrentServerID=e.EmployeeID ORDER BY t.TableNumber`)
  }
  async query_corte({ from, to }) {
    return this.query(`SELECT COUNT(*) AS totalFolios, ISNULL(SUM(t.TotalAmount),0) AS ventaTotal, ISNULL(SUM(t.DiscountAmount),0) AS descuentoTotal, ISNULL(AVG(t.TotalAmount),0) AS ticketPromedio FROM Transactions t WHERE t.CloseDate >= @from AND t.CloseDate < @to AND t.Status='CLOSED'`, { from, to })
  }
  async query_corte_agrupado({ from, to }) {
    return this.query(`SELECT CAST(t.CloseDate AS DATE) AS fecha, COUNT(*) AS totalFolios, ISNULL(SUM(t.TotalAmount),0) AS ventaTotal FROM Transactions t WHERE t.CloseDate >= @from AND t.CloseDate < @to AND t.Status='CLOSED' GROUP BY CAST(t.CloseDate AS DATE) ORDER BY fecha ASC`, { from, to })
  }
}

module.exports = SquirrelConnector

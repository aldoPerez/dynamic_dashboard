const configStore = require('./configStore')
const validate          = (id, key) => !!(id && key) && configStore.validateApiKey(id, key)
const validateDashboard = key => !!(key) && key === process.env.DASHBOARD_KEY
module.exports = { validate, validateDashboard }

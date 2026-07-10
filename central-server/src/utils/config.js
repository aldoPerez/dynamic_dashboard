module.exports = {
  port:        parseInt(process.env.PORT || '3000'),
  corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['http://localhost:5173','http://localhost:5174'],
}
